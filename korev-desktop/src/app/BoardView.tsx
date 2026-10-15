import { Badge, type BadgeTone } from '../design-system';
import {
  nextPrStep,
  primaryPr,
  PR_STEPS,
  type AppState,
  type ChatItem,
  type PrStepTone,
  type Workspace,
} from '../shared/model';
import {
  activeWorkspaces,
  boardColumn,
  workspaceLabel,
  type BoardColumn,
} from '../shared/workspaces';
import { activeSessionId, selectWorkspace } from './actions';
import { useTranscript } from './hooks';
import { PageHeader } from './PageHeader';

const COLUMNS: { id: BoardColumn; label: string }[] = [
  { id: 'needs-you', label: 'Needs you' },
  { id: 'working', label: 'Working' },
  { id: 'done', label: 'Done' },
  { id: 'idle', label: 'Idle' },
];

const STEP_BADGE_TONES: Record<PrStepTone, BadgeTone> = {
  primary: 'accent',
  secondary: 'neutral',
  success: 'success',
  danger: 'danger',
};

function lastLine(items: ChatItem[] | null): string | null {
  const reply = items?.findLast((item) => item.kind === 'assistant');
  return reply?.text.trim().split('\n').at(-1) ?? null;
}

function PrStepBadge({
  state,
  workspace,
}: {
  state: AppState;
  workspace: Workspace;
}) {
  const pr = primaryPr(workspace, state.runtime[workspace.id]);
  if (!pr) return null;
  const step = PR_STEPS[nextPrStep(pr)];
  return <Badge tone={STEP_BADGE_TONES[step.tone]}>{step.label}</Badge>;
}

function BoardCard({
  state,
  workspace,
}: {
  state: AppState;
  workspace: Workspace;
}) {
  const label = workspaceLabel(workspace);
  const repo = state.repos.find((entry) => entry.id === workspace.repoId);
  const line = lastLine(useTranscript(activeSessionId(workspace)));
  return (
    <button
      type="button"
      aria-label={`Workspace ${label}`}
      onClick={() => selectWorkspace(workspace.id)}
      className="flex w-full flex-col gap-1 rounded-md border border-border-1 bg-surface p-2.5 text-left hover:bg-hover"
    >
      <span className="flex items-center gap-1.5 text-xs text-fg-3">
        <span className="truncate">{repo?.name}</span>
        <span className="flex-1 truncate">· {label}</span>
        <PrStepBadge state={state} workspace={workspace} />
      </span>
      <span className="truncate text-sm font-medium text-fg-1">
        {workspace.branch}
      </span>
      {line ? (
        <span className="line-clamp-2 text-xs text-fg-2">{line}</span>
      ) : null}
    </button>
  );
}

function workspacesByColumn(state: AppState) {
  const columns = new Map<BoardColumn, Workspace[]>(
    COLUMNS.map((column) => [column.id, []]),
  );
  for (const workspace of activeWorkspaces(state)) {
    const runtime = state.runtime[workspace.id];
    columns.get(runtime ? boardColumn(runtime) : 'idle')?.push(workspace);
  }
  return columns;
}

export function BoardView({ state }: { state: AppState }) {
  const columns = workspacesByColumn(state);
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-app">
      <PageHeader title="Board" />
      <div className="grid min-h-0 flex-1 grid-cols-4 gap-px bg-border-1">
        {COLUMNS.map(({ id, label }) => {
          const workspaces = columns.get(id) ?? [];
          return (
            <section
              key={id}
              aria-label={label}
              className="flex min-h-0 flex-col bg-app"
            >
              <h2 className="flex flex-none items-center gap-2 px-3 py-2 text-xs font-semibold text-fg-2">
                {label}
                <Badge count>{workspaces.length}</Badge>
              </h2>
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
                {workspaces.map((workspace) => (
                  <BoardCard
                    key={workspace.id}
                    state={state}
                    workspace={workspace}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
