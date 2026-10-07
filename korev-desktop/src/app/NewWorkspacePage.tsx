import { useState } from 'react';
import { Button, Icon } from '../design-system';
import { AGENT_LABELS, type AppState } from '../shared/model';
import { createWorkspaces, selectWorkspace } from './actions';
import { Composer } from './chat/Composer';
import { timeAgo } from './format';
import { DRAG_REGION, TRAFFIC_LIGHT_GUTTER } from './layout';
import { RepoPicker } from './RepoPicker';
import { AddRepositoryMenu } from './Sidebar';
import { useUi } from './ui-store';
import { cn } from '../design-system';

const RECENT_LIMIT = 5;

export function NewWorkspacePage({
  state,
  repoId,
}: {
  state: AppState;
  repoId: string | null;
}) {
  const sidebar = useUi((ui) => ui.sidebar);
  const lastRepoId = useUi(
    (ui) =>
      state.workspaces.find((ws) => ws.id === ui.workspaceId)?.repoId ?? null,
  );
  const initialRepoId = repoId ?? lastRepoId ?? state.repos[0]?.id;
  const [repoIds, setRepoIds] = useState(initialRepoId ? [initialRepoId] : []);
  const repos = state.repos.filter((entry) => repoIds.includes(entry.id));
  const agent = state.settings.defaultAgent;
  const [model, setModel] = useState(state.settings.defaultModels[agent]);
  const [effort, setEffort] = useState(state.settings.defaultEffort[agent]);
  const [planMode, setPlanMode] = useState(state.settings.defaultPlanMode);
  const [creating, setCreating] = useState(false);
  const models =
    state.agents.find((entry) => entry.agent === agent)?.models ?? [];
  const recent = state.workspaces
    .filter((ws) => !ws.archivedAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, RECENT_LIMIT);

  async function create(text: string | null) {
    if (!repos.length) return false;
    setCreating(true);
    const created = await createWorkspaces(
      repos.map((entry) => entry.id),
      text ? { text, model, effort, planMode } : null,
    );
    setCreating(false);
    return created;
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div
        className={cn(
          'h-11 flex-none',
          DRAG_REGION,
          !sidebar && TRAFFIC_LIGHT_GUTTER,
        )}
      />
      <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 pt-[12vh]">
        <div className="flex w-full max-w-[720px] flex-col gap-4">
          <h1 className="m-0 type-h2 text-fg-1">New workspace</h1>
          <div className="flex items-start gap-2 text-sm text-fg-3">
            <RepoPicker
              state={state}
              selected={repoIds}
              onChange={setRepoIds}
            />
            <span className="flex-1" />
            <AddRepositoryMenu
              trigger={(toggle) => (
                <Button
                  size="sm"
                  variant="ghost"
                  icon="folder-plus"
                  onClick={toggle}
                >
                  Add project
                </Button>
              )}
            />
          </div>
          {repos.length > 1 ? (
            <p className="m-0 text-xs text-fg-3">
              Creates one linked workspace per repository with the same branch
              name. Each agent works in its own repository and can read the
              others.
            </p>
          ) : null}
          <Composer
            draftKey={`new-workspace:${repoIds.join(',') || 'none'}`}
            agent={agent}
            models={models}
            model={model}
            effort={effort}
            planMode={planMode}
            running={creating}
            workspaceId={null}
            autoFocus
            placeholder={`Describe a task for ${AGENT_LABELS[agent]}. Enter creates the workspace and starts it.`}
            onModelChange={setModel}
            onEffortChange={setEffort}
            onPlanModeChange={setPlanMode}
            onSend={(text) => create(text)}
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              icon="plus"
              loading={creating}
              disabled={!repos.length}
              onClick={() => void create(null)}
            >
              Create empty workspace
            </Button>
          </div>
          {recent.length ? (
            <section aria-label="Recent workspaces" className="mt-6">
              <div className="mb-1.5 type-overline text-fg-4">Recent</div>
              {recent.map((workspace) => (
                <button
                  key={workspace.id}
                  type="button"
                  className="flex h-9 w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2 text-left text-sm text-fg-2 hover:bg-hover"
                  onClick={() => selectWorkspace(workspace.id)}
                >
                  <Icon name="git-branch" size={13} className="text-fg-4" />
                  <span className="truncate text-fg-1">{workspace.branch}</span>
                  <span className="text-xs text-fg-4">{workspace.name}</span>
                  <span className="flex-1" />
                  <span className="text-xs text-fg-4">
                    {timeAgo(workspace.createdAt)}
                  </span>
                </button>
              ))}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
