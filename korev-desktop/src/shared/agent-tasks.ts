export type AgentTaskKind = 'explain';

export const AGENT_TASK_KINDS: readonly AgentTaskKind[] = ['explain'];

export interface AgentTaskWords {
  name: string;
  running: string;
  failed: string;
}

export const AGENT_TASK_WORDS: Record<AgentTaskKind, AgentTaskWords> = {
  explain: { name: 'Explain', running: 'Explaining', failed: 'Explain failed' },
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
};
