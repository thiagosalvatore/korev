import { createContext, useContext } from 'react';
import { Badge, Button, Icon } from '../../design-system';
import {
  AGENT_TASK_STEP_LABELS,
  AGENT_TASK_WORDS,
  keepsCheckout,
  type AgentTaskState,
  type AgentTaskStep,
} from '../../shared/agent-tasks';
import { formatAge, pluralize } from '../format';
import { PanelSection } from '../inbox/PanelSection';
import { MINUTE_MS, useNow } from '../useNow';

const OPEN_TERMINAL = 'Open terminal';
const OPEN_RUN = 'Open';
export const ANSWER_QUESTIONS = 'Answer questions';
export const NEEDS_ANSWER_TITLE = 'Korev needs your answer';
const STEPS_WITH_WORKTREE: ReadonlySet<AgentTaskStep> = new Set([
  'running',
  'pushing',
]);

const AgentTasksContext = createContext<Record<string, AgentTaskState>>({});

export const AgentTasksProvider = AgentTasksContext.Provider;

export function useAgentTask(key: string): AgentTaskState | null {
  return useContext(AgentTasksContext)[key] ?? null;
}

export function isRunning(
  state: AgentTaskState | null,
): state is Extract<AgentTaskState, { status: 'running' }> {
  return state?.status === 'running';
}

export function hasWorktree(state: AgentTaskState | null): boolean {
  if (!state) return false;
  if (isRunning(state)) return STEPS_WITH_WORKTREE.has(state.step);
  return keepsCheckout(state);
}

export function runningLabel(
  state: Extract<AgentTaskState, { status: 'running' }>,
): string {
  if (state.step === 'queued') return AGENT_TASK_STEP_LABELS.queued;
  return `${AGENT_TASK_WORDS[state.kind].running}…`;
}

export function AgentTaskChip({ state }: { state: AgentTaskState }) {
  if (isRunning(state)) {
    const label = runningLabel(state);
    return (
      <Badge>
        <span className="sr-only">Korev is working: </span>
        <Icon
          name="loader"
          size={11}
          className="animate-spin motion-reduce:animate-none"
        />
        {label}
      </Badge>
    );
  }
  if (state.status === 'failed') {
    return <Badge tone="danger">{AGENT_TASK_WORDS[state.kind].failed}</Badge>;
  }
  return null;
}

export function hasChip(state: AgentTaskState | null): state is AgentTaskState {
  if (!state) return false;
  return (
    isRunning(state) || (state.status === 'failed' && keepsCheckout(state))
  );
}

interface AgentTaskStatusProps {
  state: AgentTaskState;
  latestStep?: string;
  onStop: () => void;
  onRetry: () => void;
  onOpenTerminal?: () => void;
  onOpenRun?: () => void;
}

function OpenTerminalButton({ onOpen }: { onOpen?: () => void }) {
  if (!onOpen) return null;
  return (
    <Button size="sm" variant="ghost" onClick={onOpen}>
      {OPEN_TERMINAL}
    </Button>
  );
}

function OpenRunButton({ onOpen }: { onOpen?: () => void }) {
  if (!onOpen) return null;
  return (
    <Button size="sm" onClick={onOpen}>
      {OPEN_RUN}
    </Button>
  );
}

function currentStep(
  state: Extract<AgentTaskState, { status: 'running' }>,
  latestStep: string | undefined,
): string {
  if (state.step === 'running' && latestStep) return latestStep;
  return AGENT_TASK_STEP_LABELS[state.step];
}

function RunningLine({
  state,
  latestStep,
  onStop,
  onOpenTerminal,
  onOpenRun,
}: {
  state: Extract<AgentTaskState, { status: 'running' }>;
  latestStep?: string;
  onStop: () => void;
  onOpenTerminal?: () => void;
  onOpenRun?: () => void;
}) {
  const now = useNow(MINUTE_MS);
  const words = AGENT_TASK_WORDS[state.kind];
  const line = `${words.name} · ${currentStep(state, latestStep)} · ${formatAge(state.startedAt, now)}`;
  return (
    <div className="flex items-center gap-2">
      <p className="m-0 min-w-0 flex-1 truncate text-sm text-fg-2" title={line}>
        {line}
      </p>
      <OpenRunButton onOpen={onOpenRun} />
      <OpenTerminalButton onOpen={onOpenTerminal} />
      <Button size="sm" variant="ghost" onClick={onStop}>
        Stop
      </Button>
    </div>
  );
}

function QuestionsWaiting({
  state,
  onOpenRun,
}: {
  state: Extract<AgentTaskState, { status: 'needs-input' }>;
  onOpenRun: () => void;
}) {
  return (
    <PanelSection title={NEEDS_ANSWER_TITLE}>
      <div className="flex items-center gap-2">
        <p className="m-0 min-w-0 flex-1 text-sm text-danger-text">
          {pluralize(state.questions.length, 'question')} from{' '}
          {AGENT_TASK_WORDS[state.kind].name}
        </p>
        <Button size="sm" variant="primary" onClick={onOpenRun}>
          {ANSWER_QUESTIONS}
        </Button>
      </div>
    </PanelSection>
  );
}

export function AgentTaskStatus({
  state,
  latestStep,
  onStop,
  onRetry,
  onOpenTerminal,
  onOpenRun,
}: AgentTaskStatusProps) {
  if (isRunning(state)) {
    return (
      <section className="mt-4.5">
        <RunningLine
          state={state}
          latestStep={latestStep}
          onStop={onStop}
          onOpenTerminal={onOpenTerminal}
          onOpenRun={onOpenRun}
        />
      </section>
    );
  }
  if (state.status === 'needs-input' && onOpenRun) {
    return <QuestionsWaiting state={state} onOpenRun={onOpenRun} />;
  }
  if (state.status === 'needs-input' && onOpenTerminal) {
    return (
      <section className="mt-4.5 flex justify-end">
        <OpenTerminalButton onOpen={onOpenTerminal} />
      </section>
    );
  }
  if (state.status !== 'failed') return null;
  return (
    <section className="mt-4.5 flex flex-col gap-1.5">
      <span>
        <Badge tone="danger">{AGENT_TASK_WORDS[state.kind].failed}</Badge>
      </span>
      <div className="flex items-center gap-2">
        <p className="m-0 min-w-0 flex-1 text-sm text-danger-text">
          {state.message}
        </p>
        <OpenRunButton onOpen={onOpenRun} />
        <OpenTerminalButton onOpen={onOpenTerminal} />
        <Button size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    </section>
  );
}
