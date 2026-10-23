import { useState } from 'react';
import { Badge, Button, cn, Input, Switch } from '../design-system';
import { timeAgo } from '../shared/format';
import type {
  AppState,
  AskChat,
  Automation,
  AutomationDraft,
  AutomationRun,
  AutomationSchedule,
} from '../shared/model';
import {
  ALL_DAYS,
  describeSchedule,
  formatNextRun,
  nextRunAt,
  scheduleError,
} from '../shared/schedule';
import {
  automationRunsNewestFirst,
  workspaceLabel,
} from '../shared/workspaces';
import { openAsk, selectWorkspace } from './actions';
import { api } from './bridge';
import { DRAG_REGION, NO_DRAG, TRAFFIC_LIGHT_GUTTER } from './layout';
import { AutomationsEmptyState } from './AutomationsEmptyState';
import { RepoPicker } from './RepoPicker';
import { ScheduleField } from './ScheduleField';
import { reportFailure } from './ui/toast';
import { useUi } from './ui-store';

const DEFAULT_SCHEDULE: AutomationSchedule = {
  kind: 'interval',
  minutes: 10,
  days: ALL_DAYS,
  window: null,
};
const NEW_DRAFT: AutomationDraft = {
  name: '',
  prompt: '',
  schedule: DEFAULT_SCHEDULE,
  repoIds: [],
  enabled: true,
};
const RUNS_SHOWN = 5;
const PROMPT_TEXTAREA_CLASS =
  'resize-y rounded-sm border border-border-2 bg-inset px-2.5 py-2 text-sm text-fg-1 outline-none focus:border-accent-border';

interface Editing {
  automationId: string | null;
  draft: AutomationDraft;
}

function opened(count: number): string {
  return count === 1 ? 'Opened 1 workspace' : `Opened ${count} workspaces`;
}

function runSummary(run: AutomationRun, running: boolean): string {
  if (running) return 'Running';
  if (run.workspaceIds.length) return opened(run.workspaceIds.length);
  return 'Nothing to open';
}

function repoNames(state: AppState, automation: Automation): string {
  const names = state.repos
    .filter((repo) => automation.repoIds.includes(repo.id))
    .map((repo) => repo.name);
  return names.length ? names.join(', ') : 'No repositories';
}

function AutomationForm({
  state,
  editing: { automationId, draft: initial },
  onDone,
}: {
  state: AppState;
  editing: Editing;
  onDone(): void;
}) {
  const [name, setName] = useState(initial.name);
  const [prompt, setPrompt] = useState(initial.prompt);
  const [schedule, setSchedule] = useState(initial.schedule);
  const [repoIds, setRepoIds] = useState(initial.repoIds);
  const valid = name.trim() && prompt.trim() && !scheduleError(schedule);

  function save() {
    const draft: AutomationDraft = {
      name,
      prompt,
      schedule,
      repoIds,
      enabled: initial.enabled,
    };
    void (automationId
      ? api.updateAutomation(automationId, draft)
      : api.createAutomation(draft));
    onDone();
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-border-1 bg-surface p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) save();
      }}
    >
      <Input
        label="Name"
        value={name}
        placeholder="Support tickets"
        onChange={(event) => setName(event.target.value)}
      />
      <label className="flex flex-col gap-1.5">
        <span className="type-label text-fg-2">Prompt</span>
        <textarea
          value={prompt}
          rows={5}
          placeholder="Read my open support tickets. For each one assigned to me that is not in progress and needs a code change, open a workspace to fix it."
          className={PROMPT_TEXTAREA_CLASS}
          onChange={(event) => setPrompt(event.target.value)}
        />
      </label>
      <ScheduleField schedule={schedule} onChange={setSchedule} />
      <div className="flex flex-col gap-1.5">
        <span className="type-label text-fg-2">
          Repositories it can open workspaces in
        </span>
        <RepoPicker state={state} selected={repoIds} onChange={setRepoIds} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="primary" disabled={!valid}>
          {automationId ? 'Save' : 'Create automation'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function RunRow({ state, ask }: { state: AppState; ask: AskChat }) {
  const run = ask.automationRun!;
  const running = state.runningSessions.includes(ask.session.id);
  const workspaces = state.workspaces.filter((workspace) =>
    run.workspaceIds.includes(workspace.id),
  );
  return (
    <li className="flex flex-col gap-1 border-t border-border-1 py-2">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          icon="message-circle-question"
          title="Open this run's chat"
          onClick={() => openAsk(ask.id)}
        >
          {timeAgo(ask.createdAt)}
        </Button>
        <span
          className={cn('text-xs', running ? 'text-warning-text' : 'text-fg-3')}
        >
          {runSummary(run, running)}
        </span>
        {workspaces.map((workspace) => (
          <Button
            key={workspace.id}
            size="sm"
            variant="ghost"
            icon="git-branch"
            onClick={() => selectWorkspace(workspace.id)}
          >
            {workspaceLabel(workspace)}
          </Button>
        ))}
      </div>
      {run.notes.map((note) => (
        <p key={note} className="m-0 pl-2 text-xs text-fg-3">
          {note}
        </p>
      ))}
    </li>
  );
}

function nextRun(automation: Automation): string {
  if (!automation.enabled) return ' · Off';
  const next = nextRunAt(
    automation.schedule,
    automation.lastRunAt ? new Date(automation.lastRunAt) : null,
    new Date(automation.createdAt),
  );
  return next ? ` · Next run ${formatNextRun(next, new Date())}` : '';
}

function AutomationCard({
  state,
  automation,
  onEdit,
}: {
  state: AppState;
  automation: Automation;
  onEdit(): void;
}) {
  const runs = automationRunsNewestFirst(state, automation.id);
  const running = runs.some((ask) =>
    state.runningSessions.includes(ask.session.id),
  );
  const lastRun = automation.lastRunAt
    ? ` · Last run ${timeAgo(automation.lastRunAt)}`
    : '';
  return (
    <section
      aria-label={automation.name}
      className="flex flex-col gap-2 rounded-lg border border-border-1 bg-surface p-4"
    >
      <div className="flex items-center gap-2">
        <h2 className="m-0 min-w-0 flex-1 truncate type-h3 text-fg-1">
          {automation.name}
        </h2>
        {running ? <Badge tone="warning">Running</Badge> : null}
        <Switch
          label="On"
          checked={automation.enabled}
          onChange={(enabled) =>
            void api.updateAutomation(automation.id, { enabled })
          }
        />
        <Button
          size="sm"
          icon="play"
          disabled={running}
          onClick={() => api.runAutomation(automation.id).then(reportFailure)}
        >
          Run now
        </Button>
        <Button size="sm" variant="ghost" icon="pencil" onClick={onEdit}>
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon="trash-2"
          onClick={() => void api.deleteAutomation(automation.id)}
        >
          Delete
        </Button>
      </div>
      <p className="m-0 text-xs text-fg-3">
        {describeSchedule(automation.schedule)} · {repoNames(state, automation)}
        {lastRun}
        {nextRun(automation)}
      </p>
      {runs.length ? (
        <ul className="m-0 list-none p-0">
          {runs.slice(0, RUNS_SHOWN).map((ask) => (
            <RunRow key={ask.id} state={state} ask={ask} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function AutomationsPage({ state }: { state: AppState }) {
  const sidebar = useUi((ui) => ui.sidebar);
  const [editing, setEditing] = useState<Editing | null>(null);
  const empty = !state.automations.length;
  const startNew = (draft = NEW_DRAFT) =>
    setEditing({ automationId: null, draft });
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div
        className={cn(
          'flex h-11 flex-none items-center gap-2 border-b border-border-1 pr-2',
          DRAG_REGION,
          sidebar ? 'pl-4' : TRAFFIC_LIGHT_GUTTER,
        )}
      >
        <h1 className="m-0 flex-1 text-sm font-semibold text-fg-1">
          Automations
        </h1>
        {editing || empty ? null : (
          <Button
            size="sm"
            icon="plus"
            className={NO_DRAG}
            onClick={() => startNew()}
          >
            New automation
          </Button>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 py-6">
        <div className="flex w-full max-w-[820px] flex-col gap-4">
          {empty ? null : (
            <p className="m-0 text-sm text-fg-3">
              An automation runs a prompt on a schedule while Korev is open. It
              can open a workspace for each piece of work it finds, and it never
              opens two for the same ticket.
            </p>
          )}
          {editing ? (
            <AutomationForm
              key={editing.automationId ?? 'new'}
              state={state}
              editing={editing}
              onDone={() => setEditing(null)}
            />
          ) : null}
          {empty && !editing ? (
            <AutomationsEmptyState onCreate={startNew} />
          ) : null}
          {state.automations.map((automation) => (
            <AutomationCard
              key={automation.id}
              state={state}
              automation={automation}
              onEdit={() =>
                setEditing({ automationId: automation.id, draft: automation })
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}
