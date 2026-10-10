import { Children, Fragment, useEffect, useState, type ReactNode } from 'react';
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
import {
  prBadge,
  PR_BADGE_LABELS,
  primaryPr,
  type AppState,
  type PrBadge,
  type PrStatus,
  type Repo,
  type RepoFolder,
  type Workspace,
  type WorkspaceRuntime,
} from '../shared/model';
import {
  activeWorkspaces,
  asksNewestFirst,
  crossRepoLeads,
  repoSections,
  sidebarRepoId,
  waitsForLane,
} from '../shared/workspaces';
import {
  archiveWorkspace,
  deleteAsk,
  openAsk,
  openGrid,
  openIn,
  openNewWorkspace,
  openSettings,
  restoreWorkspace,
  selectWorkspace,
} from './actions';
import { api } from './bridge';
import { askRepoNames, timeAgo } from '../shared/format';
import {
  ASK_DRAG_TYPE,
  draggable,
  useDropTarget,
  WORKSPACE_DRAG_TYPE,
} from './dnd';
import { focusedGridPane, paneAskChatId, paneWorkspaceId } from './grid';
import { DRAG_REGION, NO_DRAG } from './layout';
import { RemoteDevices } from './RemoteDevices';
import { Menu, type MenuItem } from './ui/Menu';
import { reportFailure } from './ui/toast';
import { setUi, useUi } from './ui-store';

const ROW =
  'group flex w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2 text-left text-sm text-fg-2 hover:bg-hover hover:text-fg-1';

function NavRow({
  icon,
  label,
  hint,
  active = false,
  onClick,
}: {
  icon: IconName;
  label: string;
  hint?: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      className={cn(
        ROW,
        'h-7',
        active && 'bg-active text-fg-1 hover:bg-active',
      )}
      onClick={onClick}
    >
      <Icon name={icon} size={15} className="text-fg-3" />
      <span className="flex-1">{label}</span>
      {hint ? (
        <Kbd className="opacity-0 group-hover:opacity-100">{hint}</Kbd>
      ) : null}
    </button>
  );
}

const PR_BADGE_ICONS: Record<PrBadge, { icon: IconName; className: string }> = {
  merged: { icon: 'git-merge', className: 'text-[#a371f7]' },
  closed: { icon: 'git-pull-request-closed', className: 'text-fg-4' },
  conflicts: { icon: 'git-pull-request', className: 'text-warning-text' },
  'checks-failing': {
    icon: 'git-pull-request',
    className: 'text-danger-text',
  },
  'checks-running': {
    icon: 'git-pull-request',
    className: 'text-warning-text animate-pulse',
  },
  draft: { icon: 'git-pull-request-draft', className: 'text-fg-3' },
  open: { icon: 'git-pull-request', className: 'text-success-text' },
};

export function prIcon(pr: PrStatus): {
  icon: IconName;
  className: string;
  label: string;
} {
  const badge = prBadge(pr);
  return { ...PR_BADGE_ICONS[badge], label: PR_BADGE_LABELS[badge] };
}

function prSummary(pr: PrStatus): string {
  return `PR #${pr.number} · ${prIcon(pr).label}`;
}

function StatusIcon({
  workspace,
  runtime,
}: {
  workspace: Workspace;
  runtime: WorkspaceRuntime;
}) {
  if (
    runtime.status === 'working' ||
    runtime.status === 'setting-up' ||
    runtime.status === 'creating' ||
    runtime.status === 'archiving'
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
  const pr = primaryPr(workspace, runtime);
  if (pr) {
    const { icon, className } = prIcon(pr);
    return (
      <span title={runtime.prs.map(prSummary).join('\n')}>
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
  const linkedNames = state.workspaces
    .filter(
      (other) =>
        other !== workspace &&
        other.groupId === workspace.groupId &&
        !other.archivedAt,
    )
    .map((other) =>
      other.repoId === workspace.repoId
        ? other.name
        : state.repos.find((repo) => repo.id === other.repoId)?.name,
    );
  if (!linkedNames.length) return null;
  return (
    <span
      title={`Linked with ${linkedNames.join(', ')}`}
      className="flex flex-none"
    >
      <Icon name="link" size={11} />
    </span>
  );
}

interface GroupMember {
  repo: string;
  waitsOn: string | null;
}

function WorkspaceRow({
  state,
  workspace,
  selected,
  index,
  member,
}: {
  state: AppState;
  workspace: Workspace;
  selected: boolean;
  index: number;
  member?: GroupMember;
}) {
  const runtime = state.runtime[workspace.id];
  const stats = runtime?.stats;
  const hasStats = stats && (stats.additions > 0 || stats.deletions > 0);
  const title = member ? member.repo : workspace.branch;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={selected ? 'page' : undefined}
      aria-label={
        member
          ? `Workspace ${workspace.name} in ${member.repo}`
          : `Workspace ${workspace.name}`
      }
      {...draggable(WORKSPACE_DRAG_TYPE, workspace.id)}
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
        {runtime ? (
          <StatusIcon workspace={workspace} runtime={runtime} />
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-sm',
            runtime?.unread || runtime?.status === 'waiting'
              ? 'font-semibold text-fg-1'
              : 'font-medium',
          )}
          title={title}
        >
          {title}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-fg-3">
          {member ? (
            <span className="truncate">
              {member.waitsOn
                ? `Waits for the plan in ${member.waitsOn}`
                : workspace.branch}
            </span>
          ) : (
            <>
              <LinkedIcon state={state} workspace={workspace} />
              <span className="truncate">{workspace.name}</span>
            </>
          )}
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
      <span className="absolute top-1 right-1 hidden group-hover:flex has-[[role=menu]]:flex">
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
              id: 'keep-after-merge',
              label: 'Keep after merge',
              icon: 'pin',
              checked: workspace.keepAfterMerge,
              onSelect: () =>
                void api.setKeepAfterMerge(
                  workspace.id,
                  !workspace.keepAfterMerge,
                ),
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

const repoIcons = new Map<string, Promise<string | null>>();

function repoIcon(repoId: string): Promise<string | null> {
  const cached = repoIcons.get(repoId);
  if (cached) return cached;
  const icon = api.repoIcon(repoId).catch(() => null);
  repoIcons.set(repoId, icon);
  return icon;
}

function RepoAvatar({ repo }: { repo: Repo }) {
  const [icon, setIcon] = useState<string | null>(null);
  useEffect(() => {
    void repoIcon(repo.id).then(setIcon);
  }, [repo.id]);
  if (icon) {
    return (
      <img
        src={icon}
        alt=""
        className="size-5 flex-none rounded-xs object-contain"
        onError={() => setIcon(null)}
      />
    );
  }
  return (
    <span className="flex size-5 flex-none items-center justify-center rounded-xs bg-accent-subtle font-mono text-2xs font-semibold text-accent-text uppercase">
      {repo.name.charAt(0)}
    </span>
  );
}

const REPO_DRAG_TYPE = 'application/x-korev-repo';
const FOLDER_DRAG_TYPE = 'application/x-korev-folder';
const DROP_INDICATOR = 'shadow-[inset_0_2px_0_0_var(--color-accent)]';
const MOVE_TO_FOLDER = 'Move to folder';

function useCollapsed(
  key: 'collapsedRepos' | 'expandedRepos' | 'collapsedFolders',
  id: string,
) {
  const listed = useUi((ui) => ui[key].includes(id));
  const toggle = () =>
    setUi((ui) => ({
      [key]: listed
        ? ui[key].filter((entry) => entry !== id)
        : [...ui[key], id],
    }));
  return [key === 'expandedRepos' ? !listed : listed, toggle] as const;
}

function FolderNameDialog({
  title,
  initialName = '',
  submitLabel,
  onSubmit,
  onClose,
}: {
  title: string;
  initialName?: string;
  submitLabel: string;
  onSubmit: (name: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    await onSubmit(name);
    onClose();
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={!name.trim()}
            onClick={() => submit()}
          >
            {submitLabel}
          </Button>
        </>
      }
    >
      <Input
        label="Name"
        autoFocus
        value={name}
        placeholder="Work"
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void submit();
        }}
      />
    </Dialog>
  );
}

function moveToFolderItems(
  state: AppState,
  repo: Repo,
  folderId: string | null,
  onNewFolder: () => void,
): MenuItem[] {
  const moveTo = (target: string | null) =>
    void api.moveRepo(repo.id, { folderId: target, beforeId: null });
  return [
    ...state.folders.map((folder) => ({
      id: folder.id,
      label: folder.name,
      icon: 'folder' as const,
      checked: folder.id === folderId,
      section: MOVE_TO_FOLDER,
      onSelect: () => moveTo(folder.id),
    })),
    {
      id: 'no-folder',
      label: 'No folder',
      icon: 'folder-minus',
      checked: folderId === null,
      section: MOVE_TO_FOLDER,
      onSelect: () => moveTo(null),
    },
    {
      id: 'new-folder',
      label: 'New folder…',
      icon: 'folder-plus',
      section: MOVE_TO_FOLDER,
      onSelect: onNewFolder,
    },
  ];
}

function sidebarEntries(
  workspaces: Workspace[],
  leads: Map<string, Workspace>,
): Workspace[][] {
  const entries: Workspace[][] = [];
  for (const workspace of workspaces) {
    const last = entries.at(-1);
    const grouped = workspace.groupId !== null && leads.has(workspace.groupId);
    if (grouped && last?.[0].groupId === workspace.groupId)
      last.push(workspace);
    else entries.push([workspace]);
  }
  return entries;
}

function LinkedGroup({
  state,
  lead,
  members,
  selectedId,
  indexOf,
}: {
  state: AppState;
  lead: Workspace;
  members: Workspace[];
  selectedId: string | null;
  indexOf: (workspace: Workspace) => number;
}) {
  const repoName = (workspace: Workspace) =>
    state.repos.find((repo) => repo.id === workspace.repoId)?.name ?? '';
  return (
    <div
      role="group"
      aria-label={`Linked workspace ${lead.name}`}
      className="flex flex-col gap-0.5"
    >
      <div className="flex h-6 items-center gap-1.5 px-2 text-xs text-fg-3">
        <Icon name="link" size={11} />
        <span className="truncate">{lead.name}</span>
      </div>
      <div className="flex flex-col gap-0.5 pl-3">
        {members.map((workspace) => (
          <WorkspaceRow
            key={workspace.id}
            state={state}
            workspace={workspace}
            selected={workspace.id === selectedId}
            index={indexOf(workspace)}
            member={{
              repo: repoName(workspace),
              waitsOn: waitsForLane(state, workspace) ? repoName(lead) : null,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function RepoGroup({
  state,
  repo,
  folderId,
  workspaces,
  leads,
  selectedId,
  indexOf,
}: {
  state: AppState;
  repo: Repo;
  folderId: string | null;
  workspaces: Workspace[];
  leads: Map<string, Workspace>;
  selectedId: string | null;
  indexOf: (workspace: Workspace) => number;
}) {
  const [collapsed, toggle] = useCollapsed(
    workspaces.length > 0 ? 'collapsedRepos' : 'expandedRepos',
    repo.id,
  );
  const [naming, setNaming] = useState(false);
  const drop = useDropTarget({
    [REPO_DRAG_TYPE]: (draggedId) =>
      void api.moveRepo(draggedId, { folderId, beforeId: repo.id }),
    ...(folderId === null && {
      [FOLDER_DRAG_TYPE]: (draggedId: string) =>
        void api.moveFolder(draggedId, repo.id),
    }),
  });
  async function createFolderWithRepo(name: string) {
    const folder = await api.createFolder(name);
    await api.moveRepo(repo.id, { folderId: folder.id, beforeId: null });
  }
  return (
    <section aria-label={repo.name} className="mb-2">
      <div
        {...draggable(REPO_DRAG_TYPE, repo.id)}
        {...drop.props}
        className={cn(
          'group flex h-8 items-center gap-1.5 rounded-md px-2 hover:bg-hover',
          drop.over && DROP_INDICATOR,
        )}
      >
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
        <span className="hidden gap-0.5 group-hover:flex has-[[role=menu]]:flex">
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
          <Menu
            label={`${repo.name} actions`}
            align="right"
            items={moveToFolderItems(state, repo, folderId, () =>
              setNaming(true),
            )}
            trigger={({ toggle: toggleMenu }) => (
              <IconButton
                icon="ellipsis"
                label={`${repo.name} actions`}
                size="sm"
                onClick={toggleMenu}
              />
            )}
          />
        </span>
      </div>
      {naming ? (
        <FolderNameDialog
          title="New folder"
          submitLabel="Create"
          onSubmit={createFolderWithRepo}
          onClose={() => setNaming(false)}
        />
      ) : null}
      {collapsed ? null : (
        <div className="mt-0.5 flex flex-col gap-0.5">
          {sidebarEntries(workspaces, leads).map(([first, ...rest]) => {
            const lead = first.groupId ? leads.get(first.groupId) : undefined;
            return lead ? (
              <LinkedGroup
                key={first.id}
                state={state}
                lead={lead}
                members={[first, ...rest]}
                selectedId={selectedId}
                indexOf={indexOf}
              />
            ) : (
              <WorkspaceRow
                key={first.id}
                state={state}
                workspace={first}
                selected={first.id === selectedId}
                index={indexOf(first)}
              />
            );
          })}
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

function FolderSection({
  folder,
  children,
}: {
  folder: RepoFolder;
  children: ReactNode;
}) {
  const [collapsed, toggle] = useCollapsed('collapsedFolders', folder.id);
  const [renaming, setRenaming] = useState(false);
  const drop = useDropTarget({
    [REPO_DRAG_TYPE]: (draggedId) =>
      void api.moveRepo(draggedId, { folderId: folder.id, beforeId: null }),
    [FOLDER_DRAG_TYPE]: (draggedId) =>
      void api.moveFolder(draggedId, folder.id),
  });
  const empty = !Children.count(children);
  return (
    <section aria-label={folder.name} className="mb-2">
      <div
        {...draggable(FOLDER_DRAG_TYPE, folder.id)}
        {...drop.props}
        className={cn(
          'group flex h-8 items-center gap-1 rounded-md px-2 hover:bg-hover',
          drop.over && DROP_INDICATOR,
        )}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-left type-overline text-fg-4"
          onClick={toggle}
          aria-expanded={!collapsed}
        >
          <span className="truncate">{folder.name}</span>
          <Icon
            name="chevron-down"
            size={12}
            className={cn('transition-transform', collapsed && '-rotate-90')}
          />
        </button>
        <span className="hidden group-hover:flex has-[[role=menu]]:flex">
          <Menu
            label={`${folder.name} actions`}
            align="right"
            items={[
              {
                id: 'rename',
                label: 'Rename',
                icon: 'pencil',
                onSelect: () => setRenaming(true),
              },
              {
                id: 'delete',
                label: 'Delete folder',
                icon: 'trash-2',
                danger: true,
                onSelect: () => void api.deleteFolder(folder.id),
              },
            ]}
            trigger={({ toggle: toggleMenu }) => (
              <IconButton
                icon="ellipsis"
                label={`${folder.name} actions`}
                size="sm"
                onClick={toggleMenu}
              />
            )}
          />
        </span>
      </div>
      {renaming ? (
        <FolderNameDialog
          title="Rename folder"
          initialName={folder.name}
          submitLabel="Rename"
          onSubmit={(name) => api.renameFolder(folder.id, name)}
          onClose={() => setRenaming(false)}
        />
      ) : null}
      {collapsed ? null : (
        <div className="mt-0.5 pl-2">
          {empty ? (
            <p className="px-2 py-1 text-xs text-fg-4">
              Drag repositories here
            </p>
          ) : (
            children
          )}
        </div>
      )}
    </section>
  );
}

function RootEndDropZone() {
  const drop = useDropTarget({
    [REPO_DRAG_TYPE]: (draggedId) =>
      void api.moveRepo(draggedId, { folderId: null, beforeId: null }),
    [FOLDER_DRAG_TYPE]: (draggedId) => void api.moveFolder(draggedId, null),
  });
  return (
    <div
      {...drop.props}
      className={cn('h-8 rounded-md', drop.over && DROP_INDICATOR)}
    />
  );
}

function AskChats({ state }: { state: AppState }) {
  const selectedId = useUi((ui) => {
    if (ui.page.kind === 'grid') return paneAskChatId(focusedGridPane(ui.grid));
    return ui.page.kind === 'ask' ? ui.page.askChatId : null;
  });
  const open = useUi((ui) => ui.askOpen);
  if (!state.askChats.length) return null;
  const newestFirst = asksNewestFirst(state);
  return (
    <section aria-label="Ask" className="border-b border-border-1 px-2 py-1.5">
      <button
        type="button"
        className={cn(ROW, 'h-6 gap-1 text-fg-4 hover:text-fg-2')}
        aria-expanded={open}
        onClick={() => setUi({ askOpen: !open })}
      >
        <span className="type-overline">Ask chats</span>
        <Icon
          name="chevron-down"
          size={12}
          className={cn('transition-transform', !open && '-rotate-90')}
        />
        <span className="flex-1" />
        <span className="font-mono text-2xs">{state.askChats.length}</span>
      </button>
      {open ? (
        <div className="max-h-56 overflow-y-auto">
          {newestFirst.map((ask) => {
            const running = state.runningSessions.includes(ask.session.id);
            return (
              <div
                key={ask.id}
                role="button"
                tabIndex={0}
                aria-current={ask.id === selectedId ? 'page' : undefined}
                aria-label={`Ask ${ask.session.title}`}
                {...draggable(ASK_DRAG_TYPE, ask.id)}
                onClick={() => openAsk(ask.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') openAsk(ask.id);
                }}
                className={cn(
                  'group flex min-h-9 cursor-pointer items-center gap-2 rounded-md py-1 pr-1.5 pl-2 text-fg-2 hover:bg-hover',
                  ask.id === selectedId &&
                    'bg-active text-fg-1 hover:bg-active',
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
                    {askRepoNames(state, ask)}
                  </span>
                </span>
                <span className="text-2xs text-fg-4 group-hover:hidden">
                  {timeAgo(ask.lastMessageAt)}
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
        </div>
      ) : null}
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
                  onClick={() => restoreWorkspace(workspace)}
                />
                <IconButton
                  icon="trash-2"
                  label={`Delete ${workspace.name}`}
                  size="sm"
                  onClick={() => api.deleteWorkspace(workspace.id)}
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
            onClick={() => clone()}
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
  const selectedId = useUi((ui) => {
    if (ui.page.kind === 'grid')
      return paneWorkspaceId(focusedGridPane(ui.grid));
    return ui.page.kind === 'workspace' ? ui.workspaceId : null;
  });
  const pageKind = useUi((ui) => ui.page.kind);
  const paletteOpen = useUi((ui) => ui.palette !== false);
  const active = activeWorkspaces(state);
  const leads = crossRepoLeads(state);
  const indexOf = (workspace: Workspace) => active.indexOf(workspace);
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
          active={paletteOpen}
          onClick={() => setUi({ palette: 'all' })}
        />
        <NavRow
          icon="square-pen"
          label="New workspace"
          hint="⌘N"
          active={pageKind === 'new-workspace'}
          onClick={() => openNewWorkspace(null)}
        />
        <NavRow
          icon="message-circle-question"
          label="Ask"
          active={pageKind === 'ask'}
          onClick={() => openAsk(null)}
        />
        <NavRow
          icon="layout-grid"
          label="Grid"
          hint="⌘G"
          active={pageKind === 'grid'}
          onClick={openGrid}
        />
      </div>
      <AskChats state={state} />
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-1">
        {repoSections(state).map(({ folder, repos }) => {
          const groups = repos.map((repo) => (
            <RepoGroup
              key={repo.id}
              state={state}
              repo={repo}
              folderId={folder?.id ?? null}
              workspaces={active.filter(
                (ws) => sidebarRepoId(leads, ws) === repo.id,
              )}
              leads={leads}
              selectedId={selectedId}
              indexOf={indexOf}
            />
          ));
          return folder ? (
            <FolderSection key={folder.id} folder={folder}>
              {groups}
            </FolderSection>
          ) : (
            <Fragment key={repos[0].id}>{groups}</Fragment>
          );
        })}
        <RootEndDropZone />
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
        {state.update ? (
          <IconButton
            icon="download"
            label={`Update to ${state.update.version}`}
            size="sm"
            className="text-accent-text"
            onClick={() => setUi({ updateOpen: true })}
          />
        ) : null}
        <RemoteDevices
          remote={state.remote}
          onOpen={() => openSettings('remote')}
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
