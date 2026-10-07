import { useState, type ReactNode } from 'react';
import {
  Button,
  cn,
  Dialog,
  Icon,
  IconButton,
  Input,
  Kbd,
  type IconName,
} from '../design-system';
import type {
  AppState,
  PrStatus,
  Repo,
  Workspace,
  WorkspaceRuntime,
} from '../shared/model';
import {
  archiveWorkspace,
  deleteAsk,
  openAsk,
  openIn,
  openNewWorkspace,
  openSettings,
  restoreWorkspace,
  selectWorkspace,
} from './actions';
import { api } from './bridge';
import { timeAgo } from './format';
import { DRAG_REGION, NO_DRAG } from './layout';
import { Menu } from './ui/Menu';
import { reportFailure } from './ui/toast';
import { setUi, useUi } from './ui-store';

const ROW =
  'group flex w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2 text-left text-sm text-fg-2 hover:bg-hover hover:text-fg-1';

function NavRow({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: IconName;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={cn(ROW, 'h-7')} onClick={onClick}>
      <Icon name={icon} size={15} className="text-fg-3" />
      <span className="flex-1">{label}</span>
      {hint ? (
        <Kbd className="opacity-0 group-hover:opacity-100">{hint}</Kbd>
      ) : null}
    </button>
  );
}

function prIcon(pr: PrStatus): {
  icon: IconName;
  className: string;
  label: string;
} {
  if (pr.state === 'MERGED')
    return { icon: 'git-merge', className: 'text-[#a371f7]', label: 'Merged' };
  if (pr.state === 'CLOSED')
    return {
      icon: 'git-pull-request-closed',
      className: 'text-fg-4',
      label: 'Closed',
    };
  if (pr.mergeable === 'CONFLICTING')
    return {
      icon: 'git-pull-request',
      className: 'text-warning-text',
      label: 'Conflicts',
    };
  if (pr.checks.some((check) => check.state === 'failure'))
    return {
      icon: 'git-pull-request',
      className: 'text-danger-text',
      label: 'Checks failing',
    };
  if (pr.checks.some((check) => check.state === 'pending'))
    return {
      icon: 'git-pull-request',
      className: 'text-warning-text animate-pulse',
      label: 'Checks running',
    };
  if (pr.isDraft)
    return {
      icon: 'git-pull-request-draft',
      className: 'text-fg-3',
      label: 'Draft',
    };
  return {
    icon: 'git-pull-request',
    className: 'text-success-text',
    label: 'Open',
  };
}

function StatusIcon({ runtime }: { runtime: WorkspaceRuntime }) {
  if (
    runtime.status === 'working' ||
    runtime.status === 'setting-up' ||
    runtime.status === 'creating'
  ) {
    return (
      <Icon
        name="loader-circle"
        size={14}
        className="animate-spin text-accent-text"
      />
    );
  }
  if (runtime.status === 'waiting') {
    return (
      <span title="Waiting for your input">
        <Icon
          name="message-circle-question"
          size={14}
          className="text-warning-text"
        />
      </span>
    );
  }
  if (runtime.status === 'error' || runtime.status === 'failed') {
    return (
      <Icon name="triangle-alert" size={14} className="text-danger-text" />
    );
  }
  if (runtime.pr) {
    const { icon, className, label } = prIcon(runtime.pr);
    return (
      <span title={`PR #${runtime.pr.number} · ${label}`}>
        <Icon name={icon} size={14} className={className} />
      </span>
    );
  }
  return <Icon name="git-branch" size={14} className="text-fg-4" />;
}

function LinkedIcon({
  state,
  workspace,
}: {
  state: AppState;
  workspace: Workspace;
}) {
  if (!workspace.groupId) return null;
  const linkedRepos = state.workspaces
    .filter(
      (other) =>
        other !== workspace &&
        other.groupId === workspace.groupId &&
        !other.archivedAt,
    )
    .map((other) => state.repos.find((repo) => repo.id === other.repoId)?.name);
  if (!linkedRepos.length) return null;
  return (
    <span
      title={`Linked with ${linkedRepos.join(', ')}`}
      className="flex flex-none"
    >
      <Icon name="link" size={11} />
    </span>
  );
}

function WorkspaceRow({
  state,
  workspace,
  selected,
  index,
}: {
  state: AppState;
  workspace: Workspace;
  selected: boolean;
  index: number;
}) {
  const runtime = state.runtime[workspace.id];
  const stats = runtime?.stats;
  const hasStats = stats && (stats.additions > 0 || stats.deletions > 0);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={selected ? 'page' : undefined}
      aria-label={`Workspace ${workspace.name}`}
      onClick={() => selectWorkspace(workspace.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') selectWorkspace(workspace.id);
      }}
      className={cn(
        'group relative flex min-h-11 cursor-pointer items-center gap-2 rounded-md py-1.5 pr-1.5 pl-2 text-fg-2 hover:bg-hover',
        selected && 'bg-active text-fg-1 hover:bg-active',
      )}
    >
      <span className="flex w-4 justify-center self-start pt-0.5">
        {runtime ? <StatusIcon runtime={runtime} /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-sm',
            runtime?.unread || runtime?.status === 'waiting'
              ? 'font-semibold text-fg-1'
              : 'font-medium',
          )}
          title={workspace.branch}
        >
          {workspace.branch}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-fg-3">
          <LinkedIcon state={state} workspace={workspace} />
          <span className="truncate">{workspace.name}</span>
          {runtime?.message ? (
            <span className="truncate text-danger-text">
              · {runtime.message}
            </span>
          ) : null}
        </span>
      </span>
      <span className="flex flex-none flex-col items-end gap-1 self-start pt-0.5">
        {hasStats ? (
          <span className="font-mono text-2xs">
            <span className="text-diff-add-fg">+{stats.additions}</span>{' '}
            <span className="text-diff-del-fg">−{stats.deletions}</span>
          </span>
        ) : index < 9 ? (
          <span className="font-mono text-2xs text-fg-4 opacity-0 group-hover:opacity-100">
            ⌘{index + 1}
          </span>
        ) : null}
        {runtime?.unread ? (
          <span
            aria-label="Unread"
            className="size-1.5 rounded-full bg-accent"
          />
        ) : null}
      </span>
      <span className="absolute top-1 right-1 hidden group-hover:flex">
        <Menu
          label={`${workspace.name} actions`}
          align="right"
          items={[
            {
              id: 'open',
              label: 'Open in Finder',
              icon: 'folder',
              onSelect: () => void openIn(workspace, 'finder'),
            },
            {
              id: 'archive',
              label: 'Archive',
              icon: 'archive',
              hint: '⌘⇧A',
              onSelect: () => void archiveWorkspace(state, workspace),
            },
          ]}
          trigger={({ toggle }) => (
            <IconButton
              icon="ellipsis"
              label="Workspace actions"
              size="sm"
              className="bg-raised"
              onClick={(event) => {
                event.stopPropagation();
                toggle();
              }}
            />
          )}
        />
      </span>
    </div>
  );
}

function RepoAvatar({ repo }: { repo: Repo }) {
  return (
    <span className="flex size-5 flex-none items-center justify-center rounded-xs bg-accent-subtle font-mono text-2xs font-semibold text-accent-text uppercase">
      {repo.name.charAt(0)}
    </span>
  );
}

function RepoGroup({
  state,
  repo,
  workspaces,
  selectedId,
  indexOf,
}: {
  state: AppState;
  repo: Repo;
  workspaces: Workspace[];
  selectedId: string | null;
  indexOf: (workspace: Workspace) => number;
}) {
  const collapsed = useUi((ui) => ui.collapsedRepos.includes(repo.id));
  const toggle = () =>
    setUi((ui) => ({
      collapsedRepos: collapsed
        ? ui.collapsedRepos.filter((id) => id !== repo.id)
        : [...ui.collapsedRepos, repo.id],
    }));
  return (
    <section aria-label={repo.name} className="mb-2">
      <div className="group flex h-8 items-center gap-1.5 rounded-md px-2 hover:bg-hover">
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left"
          onClick={toggle}
          aria-expanded={!collapsed}
        >
          <RepoAvatar repo={repo} />
          <span className="truncate text-sm font-semibold text-fg-1">
            {repo.name}
          </span>
          <Icon
            name="chevron-down"
            size={13}
            className={cn(
              'text-fg-4 transition-transform',
              collapsed && '-rotate-90',
            )}
          />
        </button>
        <span className="hidden gap-0.5 group-hover:flex">
          <IconButton
            icon="settings-2"
            label={`${repo.name} settings`}
            size="sm"
            onClick={() => openSettings(`repo:${repo.id}`)}
          />
          <IconButton
            icon="message-circle-question"
            label={`Ask about ${repo.name}`}
            size="sm"
            onClick={() => openAsk(null, [repo.id])}
          />
          <IconButton
            icon="plus"
            label={`New workspace in ${repo.name}`}
            size="sm"
            onClick={() => openNewWorkspace(repo.id)}
          />
        </span>
      </div>
      {collapsed ? null : (
        <div className="mt-0.5 flex flex-col gap-0.5">
          {workspaces.map((workspace) => (
            <WorkspaceRow
              key={workspace.id}
              state={state}
              workspace={workspace}
              selected={workspace.id === selectedId}
              index={indexOf(workspace)}
            />
          ))}
          {workspaces.length === 0 ? (
            <button
              type="button"
              className={cn(ROW, 'h-8 text-fg-3')}
              onClick={() => openNewWorkspace(repo.id)}
            >
              <Icon name="plus" size={14} />
              New workspace
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}

function AskChats({ state }: { state: AppState }) {
  const selectedId = useUi((ui) =>
    ui.page.kind === 'ask' ? ui.page.askChatId : null,
  );
  if (!state.askChats.length) return null;
  const repoNames = new Map(state.repos.map((repo) => [repo.id, repo.name]));
  const newestFirst = [...state.askChats].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  return (
    <section aria-label="Ask" className="mb-2">
      <div className="flex h-8 items-center px-2 type-overline text-fg-4">
        Ask
      </div>
      {newestFirst.map((ask) => {
        const running = state.runningSessions.includes(ask.session.id);
        return (
          <div
            key={ask.id}
            role="button"
            tabIndex={0}
            aria-current={ask.id === selectedId ? 'page' : undefined}
            aria-label={`Ask ${ask.session.title}`}
            onClick={() => openAsk(ask.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') openAsk(ask.id);
            }}
            className={cn(
              'group flex min-h-9 cursor-pointer items-center gap-2 rounded-md py-1 pr-1.5 pl-2 text-fg-2 hover:bg-hover',
              ask.id === selectedId && 'bg-active text-fg-1 hover:bg-active',
            )}
          >
            <Icon
              name={running ? 'loader-circle' : 'message-circle-question'}
              size={14}
              className={cn(
                running ? 'animate-spin text-accent-text' : 'text-fg-4',
              )}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {ask.session.title}
              </span>
              <span className="block truncate text-xs text-fg-3">
                {ask.repoIds.map((id) => repoNames.get(id)).join(', ')}
              </span>
            </span>
            <span className="hidden group-hover:flex">
              <IconButton
                icon="trash-2"
                label={`Delete ${ask.session.title}`}
                size="sm"
                onClick={(event) => {
                  event.stopPropagation();
                  void deleteAsk(ask);
                }}
              />
            </span>
          </div>
        );
      })}
    </section>
  );
}

function History({ state }: { state: AppState }) {
  const open = useUi((ui) => ui.historyOpen);
  const archived = state.workspaces
    .filter((ws) => ws.archivedAt)
    .sort((a, b) => (b.archivedAt ?? '').localeCompare(a.archivedAt ?? ''));
  if (!archived.length) return null;
  return (
    <section
      aria-label="History"
      className="border-t border-border-1 px-2 py-1.5"
    >
      <button
        type="button"
        className={cn(ROW, 'h-7')}
        aria-expanded={open}
        onClick={() => setUi({ historyOpen: !open })}
      >
        <Icon name="history" size={15} className="text-fg-3" />
        <span className="flex-1">History</span>
        <span className="font-mono text-2xs text-fg-4">{archived.length}</span>
      </button>
      {open ? (
        <div className="max-h-56 overflow-y-auto">
          {archived.map((workspace) => (
            <div
              key={workspace.id}
              className="group flex h-8 items-center gap-2 rounded-md px-2 text-sm text-fg-3 hover:bg-hover"
            >
              <Icon name="archive" size={13} />
              <span
                className="min-w-0 flex-1 truncate"
                title={workspace.branch}
              >
                {workspace.name}
                <span className="ml-1.5 text-xs text-fg-4">
                  {timeAgo(workspace.archivedAt ?? workspace.createdAt)}
                </span>
              </span>
              <span className="hidden gap-0.5 group-hover:flex">
                <IconButton
                  icon="archive-restore"
                  label={`Unarchive ${workspace.name}`}
                  size="sm"
                  onClick={() => void restoreWorkspace(workspace)}
                />
                <IconButton
                  icon="trash-2"
                  label={`Delete ${workspace.name}`}
                  size="sm"
                  onClick={() => void api.deleteWorkspace(workspace.id)}
                />
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function CloneDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [url, setUrl] = useState('');
  const [cloning, setCloning] = useState(false);
  async function clone() {
    setCloning(true);
    const result = await api.cloneRepo(url);
    setCloning(false);
    if (!reportFailure(result)) return;
    setUrl('');
    onClose();
    openNewWorkspace(result.value.id);
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Clone repository"
      description="Korev clones it into its own folder, then you can create workspaces from it."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={cloning}
            disabled={!url.trim()}
            onClick={() => void clone()}
          >
            Clone
          </Button>
        </>
      }
    >
      <Input
        label="Git URL"
        autoFocus
        value={url}
        placeholder="git@github.com:org/repo.git"
        onChange={(event) => setUrl(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && url.trim()) void clone();
        }}
      />
    </Dialog>
  );
}

export async function openProject() {
  const result = await api.addRepo();
  if (reportFailure(result) && result.value) openNewWorkspace(result.value.id);
}

export function AddRepositoryMenu({
  trigger,
}: {
  trigger: (toggle: () => void) => ReactNode;
}) {
  const [cloning, setCloning] = useState(false);
  return (
    <>
      <Menu
        label="Add repository"
        side="top"
        items={[
          {
            id: 'open',
            label: 'Open project',
            icon: 'folder-open',
            onSelect: () => void openProject(),
          },
          {
            id: 'clone',
            label: 'Clone from URL',
            icon: 'git-fork',
            onSelect: () => setCloning(true),
          },
        ]}
        trigger={({ toggle }) => trigger(toggle)}
      />
      <CloneDialog open={cloning} onClose={() => setCloning(false)} />
    </>
  );
}

export function Sidebar({ state }: { state: AppState }) {
  const selectedId = useUi((ui) =>
    ui.page.kind === 'workspace' ? ui.workspaceId : null,
  );
  const active = state.workspaces.filter((ws) => !ws.archivedAt);
  const ordered = state.repos.flatMap((repo) =>
    active.filter((ws) => ws.repoId === repo.id),
  );
  const indexOf = (workspace: Workspace) => ordered.indexOf(workspace);
  return (
    <nav
      aria-label="Workspaces"
      className="flex h-full w-sidebar flex-none flex-col border-r border-border-1 bg-surface"
    >
      <div
        className={cn(
          'flex h-11 flex-none items-center justify-end px-2',
          DRAG_REGION,
        )}
      >
        <IconButton
          icon="panel-left"
          label="Hide sidebar"
          size="sm"
          className={NO_DRAG}
          onClick={() => setUi({ sidebar: false })}
        />
      </div>
      <div className="flex flex-col gap-0.5 px-2 pb-2">
        <NavRow
          icon="search"
          label="Search"
          hint="⌘K"
          onClick={() => setUi({ palette: true })}
        />
        <NavRow
          icon="square-pen"
          label="New workspace"
          hint="⌘N"
          onClick={() => openNewWorkspace(null)}
        />
        <NavRow
          icon="message-circle-question"
          label="Ask"
          onClick={() => openAsk(null)}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-1">
        <AskChats state={state} />
        {state.repos.map((repo) => (
          <RepoGroup
            key={repo.id}
            state={state}
            repo={repo}
            workspaces={active.filter((ws) => ws.repoId === repo.id)}
            selectedId={selectedId}
            indexOf={indexOf}
          />
        ))}
      </div>
      <History state={state} />
      <div className="flex items-center gap-1 border-t border-border-1 p-2">
        <AddRepositoryMenu
          trigger={(toggle) => (
            <button
              type="button"
              className={cn(ROW, 'h-7 flex-1')}
              onClick={toggle}
            >
              <Icon name="folder-plus" size={15} className="text-fg-3" />
              Add repository
            </button>
          )}
        />
        <IconButton
          icon="settings"
          label="Settings"
          size="sm"
          onClick={() => openSettings()}
        />
      </div>
    </nav>
  );
}
