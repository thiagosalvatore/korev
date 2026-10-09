import { useEffect, useState } from 'react';
import { Button, cn, Icon, IconButton } from '../design-system';
import {
  AGENT_LABELS,
  type AppState,
  type Repo,
  type WorkspaceSource,
} from '../shared/model';
import { createWorkspaces, selectWorkspace } from './actions';
import { api } from './bridge';
import { Composer } from './chat/Composer';
import {
  createFromLabel,
  CreateFromPicker,
  issuePrompt,
  type CreateFrom,
} from './CreateFromPicker';
import { loadoutChoices, modelChoices, timeAgo } from '../shared/format';
import { useModelChoice } from './hooks';
import { DRAG_REGION, TRAFFIC_LIGHT_GUTTER } from './layout';
import { RepoPicker } from './RepoPicker';
import { AddRepositoryMenu } from './Sidebar';
import { Menu } from './ui/Menu';
import { toast } from './ui/toast';
import { useUi } from './ui-store';

const RECENT_LIMIT = 5;
const NEW_WORKSPACE_DRAFT_KEY = 'new-workspace';

function workspaceSource(
  from: CreateFrom | null,
  baseBranch: string | null,
): WorkspaceSource {
  if (!from) return { kind: 'new', baseBranch };
  if (from.kind === 'branch') return from;
  if (from.kind === 'pr') {
    return {
      kind: 'pr',
      number: from.pr.number,
      branch: from.pr.headRefName,
      baseBranch: from.pr.baseRefName,
    };
  }
  return { kind: 'issue', number: from.issue.number, title: from.issue.title };
}

function useCreateFromShortcut(enabled: boolean, toggle: () => void) {
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'i')
        return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, toggle]);
}

function TargetBranchMenu({
  repo,
  baseBranch,
  onChange,
}: {
  repo: Repo;
  baseBranch: string | null;
  onChange: (branch: string) => void;
}) {
  const [branches, setBranches] = useState<string[]>([]);
  return (
    <Menu
      label="Target branch"
      items={(branches.length ? branches : [repo.defaultBranch]).map(
        (branch) => ({
          id: branch,
          label: branch,
          checked: branch === (baseBranch ?? repo.defaultBranch),
          onSelect: () => onChange(branch),
        }),
      )}
      trigger={({ toggle }) => (
        <button
          type="button"
          aria-label="Target branch"
          className="flex h-7 cursor-pointer items-center gap-1 rounded-sm border-0 bg-transparent px-1.5 font-mono text-xs text-fg-3 hover:bg-hover hover:text-fg-1"
          onClick={() => {
            if (!branches.length)
              void api.listBranches(repo.id).then(setBranches);
            toggle();
          }}
        >
          <Icon name="git-branch" size={12} />
          from origin/{baseBranch ?? repo.defaultBranch}
        </button>
      )}
    />
  );
}

export function NewWorkspacePage({
  state,
  repoId,
}: {
  state: AppState;
  repoId: string | null;
}) {
  const sidebar = useUi((ui) => ui.sidebar);
  const onlyRepoId = state.repos.length === 1 ? state.repos[0].id : null;
  const initialRepoId = repoId ?? onlyRepoId;
  const [repoIds, setRepoIds] = useState(initialRepoId ? [initialRepoId] : []);
  const repos = state.repos.filter((entry) => repoIds.includes(entry.id));
  const singleRepo = repos.length === 1 ? repos[0] : null;
  const { agent, model, effort, setEffort, choose } = useModelChoice(
    state.settings,
  );
  const [planMode, setPlanMode] = useState(state.settings.defaultPlanMode);
  const [fast, setFast] = useState(false);
  const [creating, setCreating] = useState(false);
  const [from, setFrom] = useState<CreateFrom | null>(null);
  const [picking, setPicking] = useState(false);
  const [baseBranch, setBaseBranch] = useState<string | null>(null);
  const [keepAfterMerge, setKeepAfterMerge] = useState(false);
  useCreateFromShortcut(Boolean(singleRepo), () =>
    setPicking((value) => !value),
  );
  useEffect(() => {
    setFrom(null);
    setPicking(false);
    setBaseBranch(null);
  }, [singleRepo?.id]);
  const recent = state.workspaces
    .filter((ws) => !ws.archivedAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, RECENT_LIMIT);

  async function create(text: string | null) {
    if (!repos.length) {
      toast('Choose a repository first');
      return false;
    }
    setCreating(true);
    const prompt =
      from?.kind === 'issue' ? issuePrompt(from.issue, text ?? '') : text;
    const created = await createWorkspaces(
      repos.map((entry) => entry.id),
      prompt ? { text: prompt, agent, model, effort, planMode, fast } : null,
      singleRepo ? workspaceSource(from, baseBranch) : undefined,
      keepAfterMerge,
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
            {singleRepo && !from ? (
              <TargetBranchMenu
                repo={singleRepo}
                baseBranch={baseBranch}
                onChange={setBaseBranch}
              />
            ) : null}
            {singleRepo ? (
              <Button
                size="sm"
                variant={from ? 'secondary' : 'ghost'}
                icon={
                  from?.kind === 'pr'
                    ? 'git-pull-request'
                    : from?.kind === 'issue'
                      ? 'circle-dot'
                      : 'git-branch-plus'
                }
                title="Create from a branch, pull request or issue (⌘I)"
                onClick={() => setPicking((value) => !value)}
              >
                <span className="max-w-64 truncate">
                  {from ? createFromLabel(from) : 'Create from…'}
                </span>
              </Button>
            ) : null}
            {singleRepo && from ? (
              <IconButton
                icon="x"
                label="Clear source"
                size="sm"
                onClick={() => setFrom(null)}
              />
            ) : null}
            <Button
              size="sm"
              variant={keepAfterMerge ? 'secondary' : 'ghost'}
              icon="pin"
              aria-pressed={keepAfterMerge}
              title="Don't archive this workspace when its pull request merges"
              onClick={() => setKeepAfterMerge((value) => !value)}
            >
              Keep after merge
            </Button>
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
          {picking && singleRepo ? (
            <CreateFromPicker
              repoId={singleRepo.id}
              onClose={() => setPicking(false)}
              onSelect={(source) => {
                setFrom(source);
                setPicking(false);
              }}
            />
          ) : null}
          <Composer
            draftKey={NEW_WORKSPACE_DRAFT_KEY}
            agent={agent}
            models={modelChoices(state, agent)}
            loadout={loadoutChoices(state, agent)}
            snippets={state.settings.snippets}
            fast={fast}
            repoId={singleRepo?.id ?? null}
            onFastChange={setFast}
            model={model}
            effort={effort}
            planMode={planMode}
            running={creating}
            workspaceId={null}
            autoFocus
            placeholder={`Describe a task for ${AGENT_LABELS[agent]}. Enter creates the workspace and starts it.`}
            onModelChange={choose}
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
              onClick={() => create(null)}
            >
              {from?.kind === 'issue'
                ? 'Create workspace for this issue'
                : 'Create empty workspace'}
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
