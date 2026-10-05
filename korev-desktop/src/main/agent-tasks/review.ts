import {
  REVIEW_SEVERITIES,
  type AgentQuestion,
  type ReviewComment,
  type ReviewDraft,
  type ReviewEvent,
  type ReviewSeverity,
} from '../../shared/agent-tasks';
import type { PullRequest } from '../../shared/pull-request';
import { RUN_TIMEOUT_MS } from '../agents/agents-service';
import type { Checkout, Checkouts } from '../checkouts';
import {
  buildPrompt,
  outputSchema,
  readTaskOutput,
  type AnsweredQuestion,
  type TaskOutput,
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
  openForFix,
  retryIfHeadMoved,
  type FixDeps,
} from './fix-steps';
import { readPrChanges, type PrChanges } from './pr-changes';
import { MALFORMED_OUTPUT, runStructured, type RunAgent } from './run-agent';

export const REVIEW_TIMEOUT_MS = RUN_TIMEOUT_MS;
export const REVIEW_FIX_TIMEOUT_MS = FIX_TIMEOUT_MS;
export const NOTHING_TO_FIX = 'Korev found nothing to fix.';
const CONTEXT_LINES = 3;
const REVIEW_EVENTS: readonly ReviewEvent[] = ['COMMENT', 'REQUEST_CHANGES'];
const CONFIDENCES = ['high', 'low'] as const;
const LOW_CONFIDENCE = 'low';
const FINDING_QUESTION_PREFIX = 'finding:';
const DEFAULT_FIX_MESSAGE = 'Fix review findings';

export const REVIEW_SCHEMA = outputSchema({
  event: { type: 'string', enum: REVIEW_EVENTS },
  comments: {
    type: 'array',
    items: {
      type: 'object',
      additionalProperties: false,
      required: ['path', 'line', 'body', 'severity', 'confidence'],
      properties: {
        path: { type: 'string' },
        line: { type: 'integer' },
        body: { type: 'string' },
        severity: { type: 'string', enum: REVIEW_SEVERITIES },
        confidence: { type: 'string', enum: CONFIDENCES },
      },
    },
  },
});

export const REVIEW_FIX_SCHEMA = outputSchema();

interface Finding {
  path: string;
  line: number;
  body: string;
  severity: ReviewSeverity;
  confident: boolean;
}

export interface ReviewInput {
  pr: PullRequest;
  body: string;
  changes: PrChanges;
  instructions: string;
  answered: AnsweredQuestion[];
}

export function reviewPrompt(input: ReviewInput): string {
  const { pr } = input;
  return buildPrompt({
    task: `You are Korev's review agent. The current folder is a read-only checkout of ${pr.repo} pull request #${pr.number} ("${pr.title}") at its head commit. It merges ${pr.headRefName} into ${pr.baseRefName}. Review it.`,
    rules: [
      'Do not edit files. Report each finding in "comments" with the file path from the repository root, the line number in the pull request version of the file, the comment to post, a severity (critical, high, medium or low) and your confidence (high or low).',
      'Comment only on lines the pull request adds or changes.',
      'When you are not sure a finding is real, set its confidence to low. Korev asks the user about those instead of posting them.',
      'Set "event" to REQUEST_CHANGES only when a critical or high finding must be fixed before merging; otherwise COMMENT. Korev never approves for the user.',
      'Put the review summary to post as the review body in "summary". Set "changed" to false and "commitMessage" to null.',
    ],
    instructions: input.instructions,
    answered: input.answered,
    data: [
      { label: 'PR description', text: input.body || '(empty)' },
      { label: 'Diff stat', text: input.changes.diffStat },
      { label: 'Diff', text: input.changes.diff },
    ],
    output: 'Reply only with JSON that matches the output schema.',
  });
}

function findingText(finding: Finding): string {
  return `${finding.path}:${finding.line} (${finding.severity}) ${finding.body}`;
}

export function reviewFixPrompt(
  pr: PullRequest,
  findings: Finding[],
  instructions: string,
  answered: AnsweredQuestion[],
): string {
  return buildPrompt({
    task: `You are Korev's fix agent. The current folder is a checkout of ${pr.repo} pull request #${pr.number} ("${pr.title}") at its head. A review of it found the problems listed below. Fix them.`,
    rules: [
      'Fix each finding in the code. If a finding turns out to be wrong, leave it and say so in "summary".',
      'Do not run git commands that change the repository, such as add, commit, merge, rebase, reset or checkout. Korev commits and pushes.',
      'Put a one-sentence summary in "summary". When you changed files, set "changed" to true and write a short commit subject in "commitMessage".',
    ],
    instructions,
    answered,
    data: [{ label: 'Findings', text: findings.map(findingText).join('\n') }],
    output: 'Reply only with JSON that matches the output schema.',
  });
}

function toFinding(value: unknown): Finding[] {
  const fields = value as Partial<
    Record<keyof Finding | 'confidence', unknown>
  >;
  if (typeof fields?.path !== 'string' || !fields.path) return [];
  if (!Number.isInteger(fields.line) || (fields.line as number) < 1) return [];
  if (typeof fields.body !== 'string' || !fields.body.trim()) return [];
  const severity = REVIEW_SEVERITIES.find((level) => level === fields.severity);
  return [
    {
      path: fields.path,
      line: fields.line as number,
      body: fields.body,
      severity: severity ?? 'medium',
      confident: fields.confidence !== LOW_CONFIDENCE,
    },
  ];
}

function readFindings(fields: Record<string, unknown>): Finding[] {
  return Array.isArray(fields.comments)
    ? fields.comments.flatMap(toFinding)
    : [];
}

function readEvent(fields: Record<string, unknown>): ReviewEvent {
  return fields.event === 'REQUEST_CHANGES' ? 'REQUEST_CHANGES' : 'COMMENT';
}

function findingQuestion(finding: Finding, index: number): AgentQuestion {
  return {
    id: `${FINDING_QUESTION_PREFIX}${index + 1}`,
    question: `Korev isn't sure about this finding. Should it keep it?\n"${finding.body}"`,
    context: `${finding.path}:${finding.line}`,
  };
}

async function fileLines(
  checkouts: Checkouts,
  path: string,
  file: string,
): Promise<string[]> {
  const shown = await checkouts.tryGit(path, ['show', `HEAD:${file}`]);
  return shown.exitCode === 0
    ? shown.stdout.replace(/\n$/, '').split('\n')
    : [];
}

async function toComments(
  checkouts: Checkouts,
  checkout: Checkout,
  findings: Finding[],
): Promise<ReviewComment[]> {
  const files = new Map<string, Promise<string[]>>();
  return Promise.all(
    findings.map(async (finding, index) => {
      if (!files.has(finding.path)) {
        files.set(
          finding.path,
          fileLines(checkouts, checkout.path, finding.path),
        );
      }
      const lines = await files.get(finding.path)!;
      const contextStart = Math.max(1, finding.line - CONTEXT_LINES);
      return {
        id: `c${index + 1}`,
        path: finding.path,
        line: finding.line,
        body: finding.body,
        severity: finding.severity,
        contextStart,
        context: lines.slice(contextStart - 1, finding.line + CONTEXT_LINES),
        status: 'open' as const,
      };
    }),
  );
}

export interface ReviewDeps {
  checkouts: Checkouts;
  runAgent: RunAgent;
  prBody(pr: PullRequest): Promise<string>;
}

interface ReviewResult {
  output: TaskOutput;
  findings: Finding[];
  event: ReviewEvent;
  checkout: Checkout;
}

async function runReview(
  deps: ReviewDeps,
  run: TaskRun,
  checkout: Checkout,
): Promise<ReviewResult> {
  const { pr } = run;
  const [body, changes] = await Promise.all([
    deps.prBody(pr),
    readPrChanges(deps.checkouts, checkout.path, pr),
  ]);
  run.step('running');
  const fields = await runStructured(deps.runAgent, {
    prompt: reviewPrompt({
      pr,
      body,
      changes,
      instructions: run.instructions,
      answered: run.answered,
    }),
    cwd: checkout.path,
    access: 'read-only',
    schema: REVIEW_SCHEMA,
    timeoutMs: REVIEW_TIMEOUT_MS,
    signal: run.signal,
    onActivity: run.onActivity,
  });
  const output = readTaskOutput(fields);
  if (!output) throw new TaskError(MALFORMED_OUTPUT);
  return {
    output,
    findings: readFindings(fields),
    event: readEvent(fields),
    checkout,
  };
}

function questionsFor(result: ReviewResult): AgentQuestion[] {
  const unsure = result.findings.filter((finding) => !finding.confident);
  return [...result.output.questions, ...unsure.map(findingQuestion)];
}

export function createReviewTask(deps: ReviewDeps): AgentTask {
  return {
    async run(run) {
      const checkout = await deps.checkouts.open({
        repo: run.pr.repo,
        number: run.pr.number,
        baseRefName: run.pr.baseRefName,
      });
      const result = await runReview(deps, run, checkout);
      const questions = questionsFor(result);
      if (questions.length > 0) return { status: 'needs-input', questions };
      const review: ReviewDraft = {
        headOid: checkout.headOid,
        summary: result.output.summary,
        event: result.event,
        comments: await toComments(deps.checkouts, checkout, result.findings),
      };
      return {
        status: 'done',
        summary: result.output.summary,
        commits: [],
        review,
      };
    },
  };
}

export interface ReviewFixDeps extends ReviewDeps, FixDeps {}

export function createReviewFixTask(deps: ReviewFixDeps): AgentTask {
  async function attempt(run: TaskRun): Promise<TaskOutcome> {
    const checkout = await openForFix(deps.checkouts, run.pr);
    const result = await runReview(deps, run, checkout);
    const questions = questionsFor(result);
    if (questions.length > 0) return { status: 'needs-input', questions };
    if (result.findings.length === 0) {
      return { status: 'done', summary: NOTHING_TO_FIX, commits: [] };
    }
    const fields = await runStructured(deps.runAgent, {
      prompt: reviewFixPrompt(
        run.pr,
        result.findings,
        run.instructions,
        run.answered,
      ),
      cwd: checkout.path,
      access: 'edit',
      schema: REVIEW_FIX_SCHEMA,
      timeoutMs: REVIEW_FIX_TIMEOUT_MS,
      signal: run.signal,
      onActivity: run.onActivity,
    });
    const output = readTaskOutput(fields);
    if (!output) throw new TaskError(MALFORMED_OUTPUT);
    if (output.questions.length > 0) {
      return { status: 'needs-input', questions: output.questions };
    }
    if (!output.changed) {
      return { status: 'done', summary: output.summary, commits: [] };
    }
    run.step('pushing');
    const commits = await commitAndPush(
      deps,
      checkout,
      run.pr,
      output.commitMessage ?? DEFAULT_FIX_MESSAGE,
    );
    return { status: 'done', summary: output.summary, commits };
  }

  return {
    run: (run) => retryIfHeadMoved(deps.checkouts, run.pr, () => attempt(run)),
  };
}
