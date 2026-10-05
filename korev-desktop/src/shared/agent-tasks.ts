export type AgentTaskKind = 'explain' | 'fix-conflicts';

export const AGENT_TASK_KINDS: readonly AgentTaskKind[] = [
  'fix-conflicts',
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
      finishedAt: string;
    }
  | { status: 'failed'; kind: AgentTaskKind; message: string };

export type ExplainFormat = 'html' | 'markdown';

export const EXPLAIN_FORMATS: readonly ExplainFormat[] = ['html', 'markdown'];

export interface AiTaskSettings {
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
