import type { PullRequest } from '../../shared/pull-request';
import type { CheckAnnotation, FailingCheck } from '../github/task-reads';
import {
  buildPrompt,
  outputSchema,
  readTaskOutput,
  type AnsweredQuestion,
  type DataBlock,
} from './contract';
import {
  TaskError,
  nothingToDo,
  type AgentTask,
  type TaskOutcome,
  type TaskRun,
} from './engine';
import {
  FIX_TIMEOUT_MS,
  REGISTRY_NETWORK_RULE,
  commitAndPush,
  openForFix,
  retryIfHeadMoved,
  type FixDeps,
} from './fix-steps';
import { MALFORMED_OUTPUT, runStructured, type RunAgent } from './run-agent';

export const FIX_CI_TIMEOUT_MS = FIX_TIMEOUT_MS;
export const FIX_CI_SCHEMA = outputSchema();
export const NO_FAILING_CHECKS = 'No checks are failing on this PR right now.';

export interface CiFailure {
  check: FailingCheck;
  annotations: CheckAnnotation[];
  logTail: string | null;
}

export interface FixCiInput {
  pr: PullRequest;
  failures: CiFailure[];
  instructions: string;
  answered: AnsweredQuestion[];
}

function annotationLine(annotation: CheckAnnotation): string {
  const where = annotation.line
    ? `${annotation.path}:${annotation.line}`
    : annotation.path;
  return `${where} ${annotation.level}: ${annotation.message}`;
}

function failureBlock({ check, annotations, logTail }: CiFailure): DataBlock {
  const parts = [
    check.summary && `Summary:\n${check.summary}`,
    check.url && `Details: ${check.url}`,
    annotations.length > 0 &&
      `Annotations:\n${annotations.map(annotationLine).join('\n')}`,
    logTail && `End of the job log:\n${logTail}`,
  ].filter(Boolean);
  return {
    label: `Failing check: ${check.name}`,
    text: parts.join('\n\n') || '(GitHub gave no details for this check)',
  };
}

export function fixCiPrompt(input: FixCiInput): string {
  const { pr } = input;
  return buildPrompt({
    task: `You are Korev's CI agent. The current folder is a checkout of ${pr.repo} pull request #${pr.number} ("${pr.title}") at its head. The checks listed below fail on it. Make them pass.`,
    rules: [
      REGISTRY_NETWORK_RULE,
      'Do not run git commands that change the repository, such as add, commit, merge, rebase, reset or checkout. Korev commits and pushes.',
      'Never weaken, skip or delete a test or a check to make it pass. If that looks like the only fix, ask instead.',
      'If a failure is flaky or comes from the CI infrastructure (a timeout, a runner problem, a service that was down) and no code change would fix it, change nothing: set "changed" to false and say why in "summary".',
      'Put a one-sentence summary of what you fixed in "summary". When you changed files, set "changed" to true and write a short commit subject for the change in "commitMessage".',
    ],
    instructions: input.instructions,
    answered: input.answered,
    data: input.failures.map(failureBlock),
    output: 'Reply only with JSON that matches the output schema.',
  });
}

export interface FixCiDeps extends FixDeps {
  runAgent: RunAgent;
  readFailures(pr: PullRequest): Promise<CiFailure[]>;
}

function workflowRunIds(failures: CiFailure[]): number[] {
  const ids = failures.flatMap(({ check }) =>
    check.isActionsJob && check.workflowRunId ? [check.workflowRunId] : [],
  );
  return [...new Set(ids)];
}

function defaultCommitMessage(failures: CiFailure[]): string {
  return `Fix ${failures.map(({ check }) => check.name).join(', ')}`;
}

export function createFixCiTask(deps: FixCiDeps): AgentTask {
  async function attempt({
    pr,
    instructions,
    answered,
    signal,
    step,
    activity,
  }: TaskRun): Promise<TaskOutcome> {
    const failures = await deps.readFailures(pr);
    if (failures.length === 0) return nothingToDo(NO_FAILING_CHECKS);
    const checkout = await openForFix(deps.checkouts, pr);
    step('running');
    const fields = await runStructured(deps.runAgent, {
      prompt: fixCiPrompt({ pr, failures, instructions, answered }),
      cwd: checkout.path,
      access: 'edit',
      network: true,
      schema: FIX_CI_SCHEMA,
      timeoutMs: FIX_CI_TIMEOUT_MS,
      signal,
      onActivity: activity,
    });
    const output = readTaskOutput(fields);
    if (!output) throw new TaskError(MALFORMED_OUTPUT);
    if (output.questions.length > 0) {
      return { status: 'needs-input', questions: output.questions };
    }
    if (!output.changed) {
      return {
        status: 'done',
        summary: output.summary,
        commits: [],
        rerunRunIds: workflowRunIds(failures),
      };
    }
    step('pushing');
    const message = output.commitMessage ?? defaultCommitMessage(failures);
    const commits = await commitAndPush(deps, checkout, pr, message);
    return { status: 'done', summary: output.summary, commits };
  }

  return {
    run: (run) => retryIfHeadMoved(deps.checkouts, run.pr, () => attempt(run)),
  };
}
