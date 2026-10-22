import { useState } from 'react';
import {
  Badge,
  Button,
  cn,
  Icon,
  Input,
  type BadgeTone,
} from '../design-system';
import {
  pendingDecisions,
  taskState,
  type AppState,
  type DecisionGate,
  type OrchestrationRun,
  type OrchestrationTask,
  type RunQuestion,
  type TaskState,
} from '../shared/model';
import { workspaceLabel } from '../shared/workspaces';
import { selectWorkspace } from './actions';
import { api } from './bridge';
import { Markdown } from './chat/Markdown';
import { DRAG_REGION, TRAFFIC_LIGHT_GUTTER } from './layout';
import { reportFailure } from './ui/toast';
import { useUi } from './ui-store';

const STATE_TONES: Record<TaskState, BadgeTone> = {
  pending: 'neutral',
  ready: 'accent',
  dispatched: 'warning',
  completed: 'success',
  failed: 'danger',
  interrupted: 'warning',
  blocked: 'danger',
};

const STATE_LABELS: Record<TaskState, string> = {
  pending: 'Waiting',
  ready: 'Ready',
  dispatched: 'Working',
  completed: 'Done',
  failed: 'Failed',
  interrupted: 'Interrupted',
  blocked: 'Needs a decision',
};

const UNTITLED_RUN = 'Untitled run';

function GateCard({
  run,
  gate,
}: {
  run: OrchestrationRun;
  gate: DecisionGate;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-surface p-3.5 shadow-1">
      <div className="flex items-center gap-1.5 text-xs text-fg-3">
        <Icon name="split" size={13} />
        Decision for {gate.taskId}
      </div>
      <p className="m-0 text-sm text-fg-1">{gate.question}</p>
      <div className="flex flex-wrap gap-1.5">
        {gate.options.map((option) => (
          <Button
            key={option}
            size="sm"
            onClick={() =>
              api.resolveGate(run.id, gate.id, option).then(reportFailure)
            }
          >
            {option}
          </Button>
        ))}
      </div>
    </div>
  );
}

function QuestionCard({
  run,
  question,
}: {
  run: OrchestrationRun;
  question: RunQuestion;
}) {
  const [answer, setAnswer] = useState('');
  const send = (text: string) =>
    api.answerQuestion(run.id, question.id, text).then(reportFailure);
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border-2 bg-raised p-3">
      <div className="flex items-center gap-1.5 text-xs text-fg-3">
        <Icon name="message-circle-question" size={13} />
        The worker of {question.taskId} asks
      </div>
      <Markdown text={question.question} breaks className="text-sm text-fg-1" />
      {question.options.length ? (
        <div className="flex flex-wrap gap-1.5">
          {question.options.map((option) => (
            <Button key={option} size="sm" onClick={() => send(option)}>
              {option}
            </Button>
          ))}
        </div>
      ) : null}
      <form
        className="flex gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (answer.trim()) void send(answer);
        }}
      >
        <Input
          aria-label={`Answer ${question.id}`}
          placeholder="Answer instead of the coordinator"
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          className="flex-1"
        />
        <Button type="submit" size="sm" disabled={!answer.trim()}>
          Answer
        </Button>
      </form>
    </div>
  );
}

export function RunDecisions({ run }: { run: OrchestrationRun }) {
  const { gates, questions } = pendingDecisions(run);
  if (!gates.length && !questions.length) return null;
  return (
    <div className="flex flex-col gap-2">
      {gates.map((gate) => (
        <GateCard key={gate.id} run={run} gate={gate} />
      ))}
      {questions.map((question) => (
        <QuestionCard key={question.id} run={run} question={question} />
      ))}
    </div>
  );
}

function TaskRow({
  state,
  run,
  task,
}: {
  state: AppState;
  run: OrchestrationRun;
  task: OrchestrationTask;
}) {
  const shown = taskState(run, task);
  const worker = state.workspaces.find((ws) => ws.id === task.workspaceId);
  return (
    <li className="flex flex-col gap-1 border-t border-border-1 py-2.5 first:border-t-0">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-fg-3">{task.id}</span>
        <span className="min-w-0 truncate text-sm font-medium text-fg-1">
          {task.title}
        </span>
        <Badge tone={STATE_TONES[shown]}>{STATE_LABELS[shown]}</Badge>
        {task.deps.length ? (
          <span className="text-xs text-fg-3">
            after {task.deps.join(', ')}
          </span>
        ) : null}
        <span className="flex-1" />
        {shown === 'interrupted' ? (
          <Button
            size="sm"
            onClick={() => api.resumeTask(run.id, task.id).then(reportFailure)}
          >
            Resume
          </Button>
        ) : null}
        {worker ? (
          <Button
            size="sm"
            variant="ghost"
            icon="git-branch"
            disabled={Boolean(worker.archivedAt)}
            onClick={() => selectWorkspace(worker.id)}
          >
            {workspaceLabel(worker)}
          </Button>
        ) : null}
      </div>
      {task.result ? (
        <p className="m-0 text-sm text-fg-2">{task.result.summary}</p>
      ) : null}
    </li>
  );
}

function RunCard({ state, run }: { state: AppState; run: OrchestrationRun }) {
  const coordinator = state.workspaces.find(
    (ws) => ws.id === run.coordinatorWorkspaceId,
  );
  const archived = !coordinator || Boolean(coordinator.archivedAt);
  return (
    <section
      aria-label={run.objective || UNTITLED_RUN}
      className="flex flex-col gap-3 rounded-lg border border-border-1 bg-surface p-4"
    >
      <div className="flex items-center gap-2">
        <h2 className="m-0 min-w-0 flex-1 truncate type-h3 text-fg-1">
          {run.objective || UNTITLED_RUN}
        </h2>
        {run.paused ? (
          <>
            <Badge tone="warning">Paused</Badge>
            <Button
              size="sm"
              variant="primary"
              onClick={() => api.resumeRun(run.id).then(reportFailure)}
            >
              Resume run
            </Button>
          </>
        ) : null}
        {archived ? (
          <span className="text-xs text-fg-3">Coordinator archived</span>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            icon="bot"
            onClick={() => selectWorkspace(coordinator.id)}
          >
            {workspaceLabel(coordinator)}
          </Button>
        )}
      </div>
      <RunDecisions run={run} />
      {run.tasks.length ? (
        <ul className="m-0 list-none p-0">
          {run.tasks.map((task) => (
            <TaskRow key={task.id} state={state} run={run} task={task} />
          ))}
        </ul>
      ) : (
        <p className="m-0 text-sm text-fg-3">No tasks yet.</p>
      )}
    </section>
  );
}

export function RunsPage({ state }: { state: AppState }) {
  const sidebar = useUi((ui) => ui.sidebar);
  const runs = state.runs.toReversed();
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div
        className={cn(
          'flex h-11 flex-none items-center border-b border-border-1 pr-2',
          DRAG_REGION,
          sidebar ? 'pl-4' : TRAFFIC_LIGHT_GUTTER,
        )}
      >
        <h1 className="m-0 text-sm font-semibold text-fg-1">Runs</h1>
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 py-6">
        <div className="flex w-full max-w-[820px] flex-col gap-4">
          {runs.length ? (
            runs.map((run) => <RunCard key={run.id} state={state} run={run} />)
          ) : (
            <p className="m-0 text-sm text-fg-3">
              No runs yet. Ask a workspace agent to coordinate other agents, and
              it starts one with korev.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
