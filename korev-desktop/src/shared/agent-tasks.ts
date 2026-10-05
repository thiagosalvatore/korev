export type AgentTaskKind =
  | 'explain'
  | 'fix-conflicts'
  | 'fix-ci'
  | 'address-comments'
  | 'review'
  | 'review-fix';

export const AGENT_TASK_KINDS: readonly AgentTaskKind[] = [
  'fix-conflicts',
  'fix-ci',
  'address-comments',
  'review',
  'review-fix',
  'explain',
];

export interface AgentTaskWords {
  name: string;
  running: string;
  failed: string;
  done: string;
}

export const AGENT_TASK_WORDS: Record<AgentTaskKind, AgentTaskWords> = {
  explain: {
    name: 'Explain',
    running: 'Explaining',
    failed: 'Explain failed',
    done: 'Explanation ready for',
  },
  'fix-conflicts': {
    name: 'Fix conflicts',
    running: 'Fixing conflicts',
    failed: 'Fix conflicts failed',
    done: 'Fixed conflicts on',
  },
  'fix-ci': {
    name: 'Fix CI',
    running: 'Fixing CI',
    failed: 'Fix CI failed',
    done: 'Fixed CI on',
  },
  'address-comments': {
    name: 'Address comments',
    running: 'Addressing comments',
    failed: 'Address comments failed',
    done: 'Addressed comments on',
  },
  review: {
    name: 'Review',
    running: 'Reviewing',
    failed: 'Review failed',
    done: 'Review draft ready for',
  },
  'review-fix': {
    name: 'Review & fix',
    running: 'Reviewing',
    failed: 'Review & fix failed',
    done: 'Reviewed and fixed',
  },
};

export type AgentTaskStep = 'queued' | 'preparing' | 'running' | 'pushing';

export const AGENT_TASK_STEP_LABELS: Record<AgentTaskStep, string> = {
  queued: 'Queued',
  preparing: 'Preparing checkout',
  running: 'Running the agent',
  pushing: 'Pushing',
};

export interface AgentQuestion {
  id: string;
  question: string;
  context: string;
}

export type AgentTaskState =
  | {
      status: 'running';
      kind: AgentTaskKind;
      step: AgentTaskStep;
      startedAt: string;
    }
  | { status: 'needs-input'; kind: AgentTaskKind; questions: AgentQuestion[] }
  | {
      status: 'done';
      kind: AgentTaskKind;
      summary: string;
      commits: string[];
      rerunRunIds?: number[];
      review?: ReviewDraft;
      finishedAt: string;
    }
  | { status: 'failed'; kind: AgentTaskKind; message: string };

export const ACTIVITY_LINES_KEPT = 500;

export interface AgentActivity {
  ref: string;
  line: string;
}

export type ReviewEvent = 'COMMENT' | 'REQUEST_CHANGES';

export type ReviewSeverity = 'critical' | 'high' | 'medium' | 'low';

export const REVIEW_SEVERITIES: readonly ReviewSeverity[] = [
  'critical',
  'high',
  'medium',
  'low',
];

export type ReviewCommentStatus = 'open' | 'accepted' | 'dismissed';

export interface ReviewComment {
  id: string;
  path: string;
  line: number;
  body: string;
  severity: ReviewSeverity;
  contextStart: number;
  context: string[];
  status: ReviewCommentStatus;
}

export interface ReviewDraft {
  headOid: string;
  summary: string;
  event: ReviewEvent;
  comments: ReviewComment[];
}

export interface ReviewSubmission {
  summary: string;
  event: ReviewEvent;
  comments: Pick<ReviewComment, 'path' | 'line' | 'body'>[];
}

export interface KorevRun {
  kind: AgentTaskKind;
  outcome: 'done' | 'failed';
  summary: string;
  commits: string[];
  finishedAt: string;
}

export const KOREV_RUNS_KEPT = 5;

export type ExplainFormat = 'html' | 'markdown';

export const EXPLAIN_FORMATS: readonly ExplainFormat[] = ['html', 'markdown'];

export interface KeepMergeableSettings {
  allMine: boolean;
  prs: Record<string, boolean>;
}

export interface AiTaskSettings {
  keepMergeable: KeepMergeableSettings;
  keepMergeableIntroSeen: boolean;
  notify: boolean;
  explainFormat: ExplainFormat;
  instructions: Partial<Record<AgentTaskKind, string>>;
}

export interface ExplanationView {
  headOid: string;
  body: string;
  stale: boolean;
}

export type QuestionAnswers = Record<string, string>;

export const DEFAULT_INSTRUCTIONS: Record<AgentTaskKind, string> = {
  explain: [
    'Explain this pull request to a reviewer who has not seen it.',
    'Start with what it changes and why, in two or three sentences.',
    'Then walk through the changes in the order a reviewer should read them,',
    'and call out anything risky, surprising or worth testing by hand.',
  ].join(' '),
  'fix-conflicts': [
    'Resolve the merge conflicts so both the pull request and the base branch keep working.',
    'Keep the intent of both sides. When the two sides changed the same code for different reasons, combine them.',
    "If the project's fast checks, such as type checking or the unit tests for the files you changed, already run offline, run them.",
  ].join(' '),
  'fix-ci': [
    'Fix the failing checks with the smallest change that makes them pass.',
    'Run the failing tests, linters or builds locally before you finish, and fix what they report.',
  ].join(' '),
  review: [
    'Review this pull request the way a careful senior engineer on the team would.',
    'Look for bugs, missing tests for changed behaviour, security problems, and code that does not do what the description says.',
    'Skip style nits that a linter would catch. Every comment must point at a line in the diff and say what to change.',
  ].join(' '),
  'review-fix': [
    'Review this pull request for bugs, missing tests and security problems, then fix what you found.',
    'Skip style nits that a linter would catch.',
  ].join(' '),
  'address-comments': [
    'Address each review comment.',
    'Make the change the reviewer asked for when it is clear and safe.',
    'When you disagree or the request is unclear, reply with your reasoning instead of changing code, or ask.',
  ].join(' '),
};

export const FORK_WITHOUT_EDITS =
  "Korev can't push to this fork: its author didn't allow edits from maintainers.";

export function canPushFixes(pr: {
  isCrossRepository: boolean;
  maintainerCanModify: boolean;
}): boolean {
  return !pr.isCrossRepository || pr.maintainerCanModify;
}

export function isAgentTaskKind(value: unknown): value is AgentTaskKind {
  return AGENT_TASK_KINDS.includes(value as AgentTaskKind);
}

export function isKeptMergeable(
  settings: KeepMergeableSettings,
  ref: string,
): boolean {
  return settings.prs[ref] ?? settings.allMine;
}
