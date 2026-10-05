import type { PullRequest } from '../../shared/pull-request';
import { gitFailure } from '../checkouts';
import {
  buildPrompt,
  outputSchema,
  readTaskOutput,
  type AnsweredQuestion,
} from './contract';
import {
  TaskError,
  type AgentTask,
  type TaskOutcome,
  type TaskRun,
} from './engine';
import {
  FIX_TIMEOUT_MS,
  commitAndPush,
  leftoverMarkers,
  openForFix,
  retryIfHeadMoved,
  type FixDeps,
} from './fix-steps';
import { MALFORMED_OUTPUT, runStructured, type RunAgent } from './run-agent';

export const FIX_CONFLICTS_TIMEOUT_MS = FIX_TIMEOUT_MS;
export const FIX_CONFLICTS_SCHEMA = outputSchema();
const CONFLICT_DIFF_LIMIT_CHARS = 100_000;

export interface FixConflictsInput {
  pr: PullRequest;
  files: string[];
  diff: string;
  instructions: string;
  answered: AnsweredQuestion[];
}

export function fixConflictsPrompt(input: FixConflictsInput): string {
  const { pr } = input;
  return buildPrompt({
    task: `You are Korev's merge-conflict agent. The current folder is a checkout of ${pr.repo} pull request #${pr.number} ("${pr.title}"), which merges ${pr.headRefName} into ${pr.baseRefName}. Korev merged origin/${pr.baseRefName} into the pull request and git stopped with conflicts in the files listed below. Resolve them.`,
    rules: [
      'Remove every conflict marker (<<<<<<<, =======, >>>>>>>) from the files you resolve.',
      'Edit only the conflicted files, unless a resolution needs a matching change in another file.',
      'Do not run git commands that change the repository, such as add, commit, merge, rebase, reset or checkout. Korev commits the merge and pushes it.',
      'When you cannot tell which side should win in a file, leave that file unresolved and ask a question that names the file and describes both sides.',
      'Put a one-sentence summary of what you resolved in "summary". Set "changed" to true when you edited files, and "commitMessage" to null.',
    ],
    instructions: input.instructions,
    answered: input.answered,
    data: [
      { label: 'Conflicted files', text: input.files.join('\n') },
      { label: 'Conflicts', text: input.diff },
    ],
    output: 'Reply only with JSON that matches the output schema.',
  });
}

export interface FixConflictsDeps extends FixDeps {
  runAgent: RunAgent;
}

async function isMerging(deps: FixDeps, path: string): Promise<boolean> {
  const head = await deps.checkouts.tryGit(path, [
    'rev-parse',
    '-q',
    '--verify',
    'MERGE_HEAD',
  ]);
  return head.exitCode === 0;
}

async function conflictedFiles(deps: FixDeps, path: string) {
  const names = await deps.checkouts.git(path, [
    'diff',
    '--name-only',
    '--diff-filter=U',
  ]);
  return names ? names.split('\n') : [];
}

async function mergeBase(deps: FixDeps, path: string, pr: PullRequest) {
  const merge = await deps.checkouts.tryGit(path, [
    'merge',
    '--no-edit',
    `origin/${pr.baseRefName}`,
  ]);
  if (merge.exitCode === 0) return;
  if ((await conflictedFiles(deps, path)).length > 0) return;
  throw gitFailure(merge.stderr || merge.stdout);
}

function mergeMessage(pr: PullRequest): string {
  return `Merge ${pr.baseRefName} into ${pr.headRefName}`;
}

export function createFixConflictsTask(deps: FixConflictsDeps): AgentTask {
  async function attempt(
    pr: PullRequest,
    instructions: string,
    answered: AnsweredQuestion[],
    signal: AbortSignal,
    step: (step: 'running' | 'pushing') => void,
    activity: TaskRun['activity'],
  ): Promise<TaskOutcome> {
    const checkout = await openForFix(deps.checkouts, pr);
    if (!(await isMerging(deps, checkout.path))) {
      await mergeBase(deps, checkout.path, pr);
    }
    const files = await conflictedFiles(deps, checkout.path);
    let summary = `Merged ${pr.baseRefName} without conflicts.`;
    if (files.length > 0) {
      step('running');
      const diff = await deps.checkouts.git(checkout.path, [
        'diff',
        '--',
        ...files,
      ]);
      const fields = await runStructured(deps.runAgent, {
        prompt: fixConflictsPrompt({
          pr,
          files,
          diff: diff.slice(0, CONFLICT_DIFF_LIMIT_CHARS),
          instructions,
          answered,
        }),
        cwd: checkout.path,
        access: 'edit',
        schema: FIX_CONFLICTS_SCHEMA,
        timeoutMs: FIX_CONFLICTS_TIMEOUT_MS,
        signal,
        onActivity: activity,
      });
      const output = readTaskOutput(fields);
      if (!output) throw new TaskError(MALFORMED_OUTPUT);
      if (output.questions.length > 0) {
        return { status: 'needs-input', questions: output.questions };
      }
      const marked = await leftoverMarkers(
        deps.checkouts,
        checkout.path,
        files,
      );
      if (marked.length > 0) {
        throw new TaskError(
          `Conflict markers are still in ${marked.join(', ')}. Korev pushed nothing.`,
        );
      }
      summary = output.summary;
    }
    step('pushing');
    const commits = await commitAndPush(deps, checkout, pr, mergeMessage(pr));
    return { status: 'done', summary, commits };
  }

  return {
    run: ({ pr, instructions, answered, signal, step, activity }) =>
      retryIfHeadMoved(deps.checkouts, pr, () =>
        attempt(pr, instructions, answered, signal, step, activity),
      ),
  };
}
