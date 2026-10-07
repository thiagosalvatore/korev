import { useState } from 'react';
import { Button, Icon } from '../design-system';
import { AGENT_LABELS, type AppState } from '../shared/model';
import { createWorkspaceAndSend, selectWorkspace } from './actions';
import { Composer } from './chat/Composer';
import { timeAgo } from './format';
import { DRAG_REGION, TRAFFIC_LIGHT_GUTTER } from './layout';
import { AddRepositoryMenu } from './Sidebar';
import { Menu } from './ui/Menu';
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
  const [selectedRepoId, setSelectedRepoId] = useState(
    repoId ?? lastRepoId ?? state.repos[0]?.id ?? null,
  );
  const repo =
    state.repos.find((entry) => entry.id === selectedRepoId) ?? state.repos[0];
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
    if (!repo) return false;
    setCreating(true);
    const workspace = await createWorkspaceAndSend(
      repo.id,
      text ? { text, model, effort, planMode } : null,
    );
    setCreating(false);
    return workspace !== null;
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
          <div className="flex items-center gap-2 text-sm text-fg-3">
            <Menu
              label="Repository"
              items={state.repos.map((entry) => ({
                id: entry.id,
                label: entry.name,
                checked: entry.id === repo?.id,
                onSelect: () => setSelectedRepoId(entry.id),
              }))}
              trigger={({ toggle }) => (
                <button
                  type="button"
                  aria-label="Repository"
                  className="flex h-7 cursor-pointer items-center gap-1.5 rounded-sm border-0 bg-transparent px-1.5 text-sm font-semibold text-fg-1 hover:bg-hover"
                  onClick={toggle}
                >
                  <Icon name="folder-git-2" size={14} className="text-fg-3" />
                  {repo?.name ?? 'Choose a repository'}
                  <Icon name="chevron-down" size={13} className="text-fg-4" />
                </button>
              )}
            />
            {repo ? (
              <span className="flex items-center gap-1 font-mono text-xs">
                <Icon name="git-branch" size={12} />
                from origin/{repo.defaultBranch}
              </span>
            ) : null}
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
          <Composer
            draftKey={`new-workspace:${repo?.id ?? 'none'}`}
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
              disabled={!repo}
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
