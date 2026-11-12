import { Children, Fragment, useEffect, useState, type ReactNode } from 'react';
import {
  Badge,
  Button,
  cn,
  Dialog,
  Icon,
  IconButton,
  Input,
  Kbd,
  LoadingRing,
  type IconName,
} from '../design-system';
import {
  failingRequiredChecks,
  keepsPrReady,
  prBadge,
  PR_BADGE_LABELS,
  primaryPr,
  type AppState,
  type AskChat,
  type PrBadge,
  type PrStatus,
  type Repo,
  type RepoFolder,
  type Workspace,
  type WorkspaceFolder,
  type WorkspaceRuntime,
} from '../shared/model';
import {
  acrossReposIn,
  activeWorkspaces,
  askSections,
  asksWaitingForYou,
  boardColumn,
  crossRepoLead,
  crossRepoLeads,
  folderRuns,
  isAcrossRepos,
  prNeedsYou,
  repoSections,
  sidebarEntries,
  waitsForLane,
  waitsForYou,
  workspaceLabel,
  workspacesWaitingForYou,
  type AcrossReposCounts,
} from '../shared/workspaces';
import {
  archiveWorkspace,
  deleteAsk,
  openAsk,
  restoreAsk,
  openAutomations,
  openBoard,
  openPullRequests,
  openGrid,
  openRuns,
  openIn,
  openNewWorkspace,
  openSettings,
  restoreWorkspace,
  selectWorkspace,
  toggleCompactNav,
} from './actions';
import { api } from './bridge';
import { askRepoNames, repoInitials, timeAgo } from '../shared/format';
import {
  ASK_DRAG_TYPE,
  draggable,
  useDropTarget,
  WORKSPACE_DRAG_TYPE,
} from './dnd';
import { focusedGridPane, paneAskChatId, paneWorkspaceId } from './grid';
import { HandsFreeButton } from './HandsFree';
import { DRAG_REGION, NO_DRAG } from './layout';
import { RemoteDevices } from './RemoteDevices';
import { Menu, type MenuItem } from './ui/Menu';
import { reportFailure } from './ui/toast';
import { setUi, useUi, type Page } from './ui-store';

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
  review: { icon: 'message-square-warning', className: 'text-warning-text' },
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

function unansweredLabel(count: number): string {
  return `${count} unanswered ${count === 1 ? 'comment' : 'comments'}`;
}

function prProblemLabels(pr: PrStatus): string[] {
  if (pr.state !== 'OPEN') return [];
  const failing = failingRequiredChecks(pr).map(
    (check) => `${check.name} failing`,
  );
  return [
    ...(pr.mergeable === 'CONFLICTING' ? ['Conflicts'] : []),
    ...failing,
    ...(pr.unansweredThreads.length
      ? [unansweredLabel(pr.unansweredThreads.length)]
      : []),
  ];
}

function prSummary(pr: PrStatus): string {
  const problems = prProblemLabels(pr);
  const details = problems.length ? problems : [prIcon(pr).label];
  return [`PR #${pr.number}`, ...details].join(' · ');
}

function unansweredCount(runtime: WorkspaceRuntime | undefined): number {
  return (runtime?.prs ?? [])
    .filter((pr) => pr.state === 'OPEN')
    .reduce((total, pr) => total + pr.unansweredThreads.length, 0);
}

function UnansweredCount({ count }: { count: number }) {
  if (!count) return null;
  const label = unansweredLabel(count);
  return (
    <span aria-label={label} title={label}>
      <Badge tone="warning" count>
        {count}
      </Badge>
    </span>
  );
}

function WaitingIcon() {
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

function StatusIcon({
  workspace,
  runtime,
}: {
  workspace: Workspace;
  runtime: WorkspaceRuntime;
}) {
  const column = boardColumn(runtime);
  if (column === 'working') {
    return <LoadingRing size={14} className="text-accent-text" />;
  }
  if (runtime.status === 'waiting') return <WaitingIcon />;
  if (column === 'needs-you') {
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

function UnreadDot() {
  return (
    <span
      aria-label="Unread"
      className="size-1.5 flex-none rounded-full bg-accent"
    />
  );
}

function needsYourInput(state: AppState, workspace: Workspace): boolean {
  return (
    boardColumn(state.runtime[workspace.id]!) === 'needs-you' ||
    prNeedsYou(state, workspace)
  );
}

function isWaitingAsk(state: AppState, ask: AskChat): boolean {
  return state.waitingSessions.includes(ask.session.id);
}

function HiddenWaitingDot({
  state,
  workspaces,
  asks = [],
}: {
  state: AppState;
  workspaces: Workspace[];
  asks?: AskChat[];
}) {
  const waiting = workspaces.filter((ws) => waitsForYou(state, ws));
  const waitingAsks = asks.filter((ask) => isWaitingAsk(state, ask));
  const count = waiting.length + waitingAsks.length;
  if (!count) return null;
  const needsInput =
    waitingAsks.length > 0 || waiting.some((ws) => needsYourInput(state, ws));
  const label = `${count} waiting for you`;
  return (
    <span
      aria-label={label}
      title={label}
      className={cn(
        'size-1.5 flex-none rounded-full',
        needsInput ? 'bg-warning' : 'bg-accent',
      )}
    />
  );
}

function WaitingForYou({
  state,
  selectedId,
}: {
  state: AppState;
  selectedId: string | null;
}) {
  const selectedAskId = useSelectedAskId();
  const waiting = workspacesWaitingForYou(state);
  const asks = asksWaitingForYou(state);
  if (!waiting.length && !asks.length) return null;
  const needsYou = waiting.filter((ws) => needsYourInput(state, ws));
  const done = waiting.filter((ws) => !needsYou.includes(ws));
  const repoName = (workspace: Workspace) =>
    state.repos.find((repo) => repo.id === workspace.repoId)?.name ?? '';
  const workspaceRow = (workspace: Workspace) => {
    const runtime = state.runtime[workspace.id]!;
    const label = workspaceLabel(workspace);
    const repo = repoName(workspace);
    return (
      <WaitingRow
        key={workspace.id}
        label={`Open ${label} in ${repo}`}
        icon={<StatusIcon workspace={workspace} runtime={runtime} />}
        title={label}
        detail={repo}
        selected={workspace.id === selectedId}
        unread={runtime.unread}
        unanswered={unansweredCount(runtime)}
        onClick={() => selectWorkspace(workspace.id)}
      />
    );
  };
  return (
    <section
      aria-label="Waiting for you"
      className="mb-2 flex flex-col gap-0.5 border-b border-border-1 pb-2"
    >
      <div className="flex h-7 items-center gap-1.5 px-2 type-overline text-fg-4">
        Waiting for you
        <Badge count>{waiting.length + asks.length}</Badge>
      </div>
      {needsYou.map(workspaceRow)}
      {asks.map((ask) => (
        <WaitingRow
          key={ask.id}
          label={`Open Ask ${ask.session.title}`}
          icon={<WaitingIcon />}
          title={ask.session.title}
          detail={`Ask · ${askRepoNames(state, ask)}`}
          selected={ask.id === selectedAskId}
          unread={false}
          unanswered={0}
          onClick={() => openAsk(ask.id)}
        />
      ))}
      {done.map(workspaceRow)}
    </section>
  );
}

function WaitingRow({
  label,
  icon,
  title,
  detail,
  selected,
  unread,
  unanswered,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  title: string;
  detail: string;
  selected: boolean;
  unread: boolean;
  unanswered: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={selected ? 'page' : undefined}
      className={cn(
        ROW,
        'h-8',
        selected && 'bg-active text-fg-1 hover:bg-active',
      )}
      onClick={onClick}
    >
      <span className="flex w-4 flex-none justify-center">{icon}</span>
      <span className="truncate font-semibold text-fg-1">{title}</span>
      <span className="flex-1 truncate text-xs text-fg-3">{detail}</span>
      <UnansweredCount count={unanswered} />
      {unread ? <UnreadDot /> : null}
    </button>
  );
}

function useSelectedAskId(): string | null {
  return useUi((ui) => {
    if (ui.page.kind === 'grid') return paneAskChatId(focusedGridPane(ui.grid));
    return ui.page.kind === 'ask' ? ui.page.askChatId : null;
  });
}

interface GroupMember {
  repo: Repo;
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
  const notice = runtime?.message ?? runtime?.setupError;
  const title = member ? member.repo.name : workspace.branch;
  const label = workspaceLabel(workspace);
  const [renaming, setRenaming] = useState(false);
  const [naming, setNaming] = useState(false);
  const [picking, setPicking] = useState(false);
  const repoFolders = state.workspaceFolders.filter(
    (folder) => folder.repoId === workspace.repoId,
  );
  const currentFolder = workspace.folderId ?? null;
  const moveToFolder = (target: string | null) =>
    void api.moveWorkspace(workspace.id, target);
  async function createFolderWithWorkspace(name: string) {
    const folder = await api.createWorkspaceFolder(workspace.repoId, name);
    await api.moveWorkspace(workspace.id, folder.id);
  }
  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-current={selected ? 'page' : undefined}
        aria-label={
          member
            ? `Workspace ${label} in ${member.repo.name}`
            : `Workspace ${label}`
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
              'flex items-center gap-1.5 text-sm',
              runtime?.unread || runtime?.status === 'waiting'
                ? 'font-semibold text-fg-1'
                : 'font-medium',
            )}
            title={title}
          >
            {member ? <RepoAvatar repo={member.repo} size="sm" /> : null}
            <span className="truncate">{title}</span>
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
                <span className="truncate" title={workspace.name}>
                  {label}
                </span>
              </>
            )}
            {notice ? (
              <span className="truncate text-danger-text">· {notice}</span>
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
          <UnansweredCount count={unansweredCount(runtime)} />
          {runtime?.unread ? <UnreadDot /> : null}
        </span>
        <span className="absolute top-1 right-1 hidden group-hover:flex has-[[role=menu]]:flex">
          <Menu
            label={`${label} actions`}
            align="right"
            items={[
              {
                id: 'rename',
                label: 'Rename',
                icon: 'pencil',
                onSelect: () => setRenaming(true),
              },
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
              ...(state.settings.keepPrsReady || workspace.keepPrReady
                ? [
                    {
                      id: 'keep-pr-ready',
                      label: 'Keep PR ready',
                      icon: 'shield-check' as const,
                      checked: keepsPrReady(workspace, state.settings),
                      onSelect: () =>
                        void api.setKeepPrReady(
                          workspace.id,
                          !keepsPrReady(workspace, state.settings),
                        ),
                    },
                  ]
                : []),
              {
                id: 'archive',
                label: 'Archive',
                icon: 'archive',
                hint: '⌘⇧A',
                onSelect: () => void archiveWorkspace(state, workspace),
              },
              ...(member
                ? []
                : moveToFolderItems(
                    repoFolders,
                    currentFolder,
                    moveToFolder,
                    () => setNaming(true),
                    () => setPicking(true),
                  )),
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
      {renaming ? (
        <NameDialog
          title="Rename workspace"
          initialName={label}
          submitLabel="Rename"
          onSubmit={(name) => api.renameWorkspace(workspace.id, name)}
          onClose={() => setRenaming(false)}
        />
      ) : null}
      {naming ? (
        <NameDialog
          title="New folder"
          submitLabel="Create"
          onSubmit={createFolderWithWorkspace}
          onClose={() => setNaming(false)}
        />
      ) : null}
      {picking ? (
        <FolderPickerDialog
          folders={repoFolders}
          current={currentFolder}
          onPick={moveToFolder}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </>
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

const AVATAR_SIZES = { md: 'size-5 text-2xs', sm: 'size-4 text-[9px]' };

function RepoAvatar({
  repo,
  size = 'md',
}: {
  repo: Repo;
  size?: keyof typeof AVATAR_SIZES;
}) {
  const [icon, setIcon] = useState<string | null>(null);
  useEffect(() => {
    void repoIcon(repo.id).then(setIcon);
  }, [repo.id]);
  if (icon) {
    return (
      <img
        src={icon}
        alt=""
        className={cn(
          AVATAR_SIZES[size],
          'flex-none rounded-xs object-contain',
        )}
        onError={() => setIcon(null)}
      />
    );
  }
  return (
    <span
      className={cn(
        AVATAR_SIZES[size],
        'flex flex-none items-center justify-center rounded-xs bg-accent-subtle font-mono font-semibold text-accent-text uppercase',
      )}
    >
      {repoInitials(repo.name)}
    </span>
  );
}

const REPO_DRAG_TYPE = 'application/x-korev-repo';
const FOLDER_DRAG_TYPE = 'application/x-korev-folder';
const DROP_INDICATOR = 'shadow-[inset_0_2px_0_0_var(--color-accent)]';
const MOVE_TO_FOLDER = 'Move to folder';
const INLINE_FOLDER_LIMIT = 2;

function toggled(list: string[], id: string): string[] {
  return list.includes(id)
    ? list.filter((entry) => entry !== id)
    : [...list, id];
}

type FoldList =
  | 'collapsedRepos'
  | 'expandedRepos'
  | 'collapsedFolders'
  | 'collapsedLinked'
  | 'collapsedAsks';

function useCollapsed(key: FoldList, id: string) {
  const listed = useUi((ui) => ui[key].includes(id));
  const toggle = () => setUi((ui) => ({ [key]: toggled(ui[key], id) }));
  return [key === 'expandedRepos' ? !listed : listed, toggle] as const;
}

function NameDialog({
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

interface FolderChoice {
  id: string;
  name: string;
}

function FolderPickerDialog({
  folders,
  current,
  onPick,
  onClose,
}: {
  folders: FolderChoice[];
  current: string | null;
  onPick: (folderId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const visible = folders.filter((folder) =>
    folder.name.toLowerCase().includes(needle),
  );
  return (
    <Dialog open onClose={onClose} title={MOVE_TO_FOLDER}>
      <Input
        icon="search"
        aria-label="Search folders"
        placeholder="Search folders"
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="mt-2 max-h-80 overflow-y-auto">
        {visible.map((folder) => (
          <button
            key={folder.id}
            type="button"
            className="flex h-7 w-full cursor-pointer items-center gap-2 rounded-sm border-0 bg-transparent px-2 text-left text-sm text-fg-1 hover:bg-hover"
            onClick={() => {
              onPick(folder.id);
              onClose();
            }}
          >
            <Icon name="folder" size={14} className="text-fg-3" />
            <span className="min-w-0 flex-1 truncate">{folder.name}</span>
            {folder.id === current ? (
              <Icon name="check" size={14} className="text-accent-text" />
            ) : null}
          </button>
        ))}
        {visible.length ? null : (
          <div className="px-2 py-1.5 text-sm text-fg-4">No folders match</div>
        )}
      </div>
    </Dialog>
  );
}

function inlineFolders(
  folders: FolderChoice[],
  current: string | null,
): FolderChoice[] {
  const currentFirst = [
    ...folders.filter((folder) => folder.id === current),
    ...folders.filter((folder) => folder.id !== current),
  ];
  return currentFirst.slice(0, INLINE_FOLDER_LIMIT);
}

function moveToFolderItems(
  folders: FolderChoice[],
  current: string | null,
  moveTo: (folderId: string | null) => void,
  onNewFolder: () => void,
  onMoreFolders: () => void,
): MenuItem[] {
  const moreFolders: MenuItem[] =
    folders.length > INLINE_FOLDER_LIMIT
      ? [
          {
            id: 'more-folders',
            label: 'More folders…',
            icon: 'folder-search',
            section: MOVE_TO_FOLDER,
            onSelect: onMoreFolders,
          },
        ]
      : [];
  return [
    ...inlineFolders(folders, current).map((folder) => ({
      id: folder.id,
      label: folder.name,
      icon: 'folder' as const,
      checked: folder.id === current,
      section: MOVE_TO_FOLDER,
      onSelect: () => moveTo(folder.id),
    })),
    ...moreFolders,
    {
      id: 'no-folder',
      label: 'No folder',
      icon: 'folder-minus',
      checked: current === null,
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

function WorkspaceFolderSection({
  state,
  folder,
  workspaces,
  children,
}: {
  state: AppState;
  folder: WorkspaceFolder;
  workspaces: Workspace[];
  children: ReactNode;
}) {
  const [collapsed, toggle] = useCollapsed('collapsedFolders', folder.id);
  const [renaming, setRenaming] = useState(false);
  const drop = useDropTarget({
    [WORKSPACE_DRAG_TYPE]: (draggedId) => {
      const dragged = state.workspaces.find((ws) => ws.id === draggedId);
      if (!dragged || crossRepoLead(state, dragged)) return;
      if (dragged.repoId === folder.repoId)
        void api.moveWorkspace(dragged.id, folder.id);
    },
  });
  return (
    <div
      role="group"
      aria-label={`Folder ${folder.name}`}
      className="flex flex-col gap-0.5"
    >
      <div
        {...drop.props}
        className={cn(
          'group flex h-7 items-center gap-1 rounded-md px-2 hover:bg-hover',
          drop.over && DROP_INDICATOR,
        )}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-left text-xs text-fg-3"
          onClick={toggle}
          aria-expanded={!collapsed}
        >
          <Icon name="folder" size={13} />
          <span className="truncate">{folder.name}</span>
          <Icon
            name="chevron-down"
            size={12}
            className={cn(
              'text-fg-4 transition-transform',
              collapsed && '-rotate-90',
            )}
          />
          {collapsed ? (
            <HiddenWaitingDot state={state} workspaces={workspaces} />
          ) : null}
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
                onSelect: () => void api.deleteWorkspaceFolder(folder.id),
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
        <NameDialog
          title="Rename folder"
          initialName={folder.name}
          submitLabel="Rename"
          onSubmit={(name) => api.renameWorkspaceFolder(folder.id, name)}
          onClose={() => setRenaming(false)}
        />
      ) : null}
      {collapsed ? null : (
        <div className="flex flex-col gap-0.5 pl-3">{children}</div>
      )}
    </div>
  );
}

function repoOf(state: AppState, repoId: string): Repo | undefined {
  return state.repos.find((repo) => repo.id === repoId);
}

function MemberChip({
  state,
  workspace,
}: {
  state: AppState;
  workspace: Workspace;
}) {
  const repo = repoOf(state, workspace.repoId);
  const runtime = state.runtime[workspace.id];
  if (!repo) return null;
  return (
    <span
      title={repo.name}
      className="flex h-5 items-center gap-1 rounded-sm bg-active px-1"
    >
      <RepoAvatar repo={repo} size="sm" />
      {runtime ? <StatusIcon workspace={workspace} runtime={runtime} /> : null}
    </span>
  );
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
  const [collapsed, toggle] = useCollapsed('collapsedLinked', lead.groupId!);
  const leadRepo = repoOf(state, lead.repoId)?.name ?? '';
  return (
    <div
      role="group"
      aria-label={`Linked workspace ${workspaceLabel(lead)}`}
      className="flex flex-col gap-0.5"
    >
      <button
        type="button"
        aria-expanded={!collapsed}
        className={cn(ROW, 'min-h-11 py-1.5')}
        onClick={toggle}
      >
        <span className="flex w-4 justify-center self-start pt-0.5">
          <Icon name="link" size={14} className="text-fg-3" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-fg-1">
            {workspaceLabel(lead)}
          </span>
          <span className="mt-0.5 flex flex-wrap gap-1">
            {members.map((workspace) => (
              <MemberChip
                key={workspace.id}
                state={state}
                workspace={workspace}
              />
            ))}
          </span>
        </span>
        <Icon
          name="chevron-down"
          size={12}
          className={cn(
            'mt-1 self-start text-fg-4 transition-transform',
            collapsed && '-rotate-90',
          )}
        />
      </button>
      {collapsed ? null : (
        <div className="ml-4 flex flex-col gap-0.5 border-l border-border-2 pl-1.5">
          {members.flatMap((workspace) => {
            const repo = repoOf(state, workspace.repoId);
            if (!repo) return [];
            return (
              <WorkspaceRow
                key={workspace.id}
                state={state}
                workspace={workspace}
                selected={workspace.id === selectedId}
                index={indexOf(workspace)}
                member={{
                  repo,
                  waitsOn: waitsForLane(state, workspace) ? leadRepo : null,
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function AskRepos({ state, ask }: { state: AppState; ask: AskChat }) {
  return (
    <>
      {ask.repoIds.map((repoId) => {
        const repo = repoOf(state, repoId);
        return repo ? <RepoAvatar key={repoId} repo={repo} size="sm" /> : null;
      })}
      <span className="truncate">{askRepoNames(state, ask)}</span>
    </>
  );
}

function AskRow({
  state,
  ask,
  detail,
}: {
  state: AppState;
  ask: AskChat;
  detail?: ReactNode;
}) {
  const selected = useSelectedAskId() === ask.id;
  const running = state.runningSessions.includes(ask.session.id);
  const waiting = isWaitingAsk(state, ask);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={selected ? 'page' : undefined}
      aria-label={`Ask ${ask.session.title}`}
      {...draggable(ASK_DRAG_TYPE, ask.id)}
      onClick={() => openAsk(ask.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') openAsk(ask.id);
      }}
      className={cn(
        'group flex min-h-9 cursor-pointer items-center gap-2 rounded-md py-1 pr-1.5 pl-2 text-fg-2 hover:bg-hover',
        selected && 'bg-active text-fg-1 hover:bg-active',
      )}
    >
      {waiting ? (
        <WaitingIcon />
      ) : (
        <Icon
          name={running ? 'loader-circle' : 'message-square'}
          size={14}
          className={cn(running ? 'text-accent-text' : 'text-fg-4')}
        />
      )}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-sm',
            waiting ? 'font-semibold text-fg-1' : 'font-medium',
          )}
        >
          {ask.session.title}
        </span>
        {detail ? (
          <span className="flex items-center gap-1.5 text-xs text-fg-3">
            {detail}
          </span>
        ) : null}
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
}

function AcrossRepos({
  state,
  groups,
  asks,
  leads,
  selectedId,
  indexOf,
}: {
  state: AppState;
  groups: Workspace[][];
  asks: AskChat[];
  leads: Map<string, Workspace>;
  selectedId: string | null;
  indexOf: (workspace: Workspace) => number;
}) {
  if (!groups.length && !asks.length) return null;
  return (
    <section
      aria-label="Across repos"
      className="mb-2 flex flex-col gap-0.5 border-b border-border-1 pb-2"
    >
      <div className="flex h-7 items-center gap-1.5 px-2 type-overline text-fg-4">
        Across repos
        <Badge count>{groups.length + asks.length}</Badge>
      </div>
      {groups.map((members) => (
        <LinkedGroup
          key={members[0].groupId}
          state={state}
          lead={leads.get(members[0].groupId!)!}
          members={members}
          selectedId={selectedId}
          indexOf={indexOf}
        />
      ))}
      {asks.map((ask) => (
        <AskRow
          key={ask.id}
          state={state}
          ask={ask}
          detail={<AskRepos state={state} ask={ask} />}
        />
      ))}
    </section>
  );
}

function FoldChevron({ collapsed }: { collapsed: boolean }) {
  return (
    <Icon
      name="chevron-down"
      size={12}
      className={cn(
        'text-fg-4 transition-transform',
        collapsed && '-rotate-90',
      )}
    />
  );
}

function AsksFold({
  state,
  repoId,
  asks,
}: {
  state: AppState;
  repoId: string;
  asks: AskChat[];
}) {
  const [collapsed, toggle] = useCollapsed('collapsedAsks', repoId);
  return (
    <div role="group" aria-label="Asks" className="flex flex-col gap-0.5">
      <button
        type="button"
        aria-expanded={!collapsed}
        className={cn(ROW, 'h-7 text-xs text-fg-3')}
        onClick={toggle}
      >
        <FoldChevron collapsed={collapsed} />
        <Icon name="messages-square" size={13} />
        <span>Asks</span>
        <span className="font-mono text-2xs text-fg-4">{asks.length}</span>
        {collapsed ? (
          <HiddenWaitingDot state={state} workspaces={[]} asks={asks} />
        ) : null}
      </button>
      {collapsed ? null : (
        <div className="max-h-56 overflow-y-auto pl-3">
          {asks.map((ask) => (
            <AskRow key={ask.id} state={state} ask={ask} />
          ))}
        </div>
      )}
    </div>
  );
}

function AlsoAcrossRepos({ counts }: { counts: AcrossReposCounts }) {
  const parts = [
    counts.linked ? `${counts.linked} linked` : null,
    counts.asks ? `${counts.asks} ${counts.asks === 1 ? 'Ask' : 'Asks'}` : null,
  ].filter(Boolean);
  if (!parts.length) return null;
  return (
    <p className="flex h-6 items-center gap-1.5 px-2 text-xs text-fg-4">
      <Icon name="link" size={11} />
      Also in {parts.join(', ')} above
    </p>
  );
}

const NO_REPOSITORY = 'no-repository';

function NoRepository({ state, asks }: { state: AppState; asks: AskChat[] }) {
  const [collapsed, toggle] = useCollapsed('collapsedRepos', NO_REPOSITORY);
  if (!asks.length) return null;
  return (
    <section aria-label="No repository" className="mb-2">
      <button
        type="button"
        aria-expanded={!collapsed}
        className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2 text-left hover:bg-hover"
        onClick={toggle}
      >
        <span className="flex size-5 flex-none items-center justify-center rounded-xs border border-dashed border-border-2 text-fg-4">
          <Icon name="message-square" size={11} />
        </span>
        <span className="truncate text-sm font-semibold text-fg-1">
          No repository
        </span>
        <FoldChevron collapsed={collapsed} />
        {collapsed ? (
          <HiddenWaitingDot state={state} workspaces={[]} asks={asks} />
        ) : null}
      </button>
      {collapsed ? null : (
        <div className="mt-0.5 max-h-56 overflow-y-auto">
          {asks.map((ask) => (
            <AskRow key={ask.id} state={state} ask={ask} />
          ))}
        </div>
      )}
    </section>
  );
}

function RepoGroup({
  state,
  repo,
  folderId,
  workspaces,
  asks,
  acrossRepos,
  selectedId,
  indexOf,
}: {
  state: AppState;
  repo: Repo;
  folderId: string | null;
  workspaces: Workspace[];
  asks: AskChat[];
  acrossRepos: AcrossReposCounts;
  selectedId: string | null;
  indexOf: (workspace: Workspace) => number;
}) {
  const hasWork =
    workspaces.length > 0 ||
    asks.length > 0 ||
    acrossRepos.linked > 0 ||
    acrossRepos.asks > 0;
  const [collapsed, toggle] = useCollapsed(
    hasWork ? 'collapsedRepos' : 'expandedRepos',
    repo.id,
  );
  const [naming, setNaming] = useState(false);
  const [picking, setPicking] = useState(false);
  const moveToFolder = (target: string | null) =>
    void api.moveRepo(repo.id, { folderId: target, beforeId: null });
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
  const entriesOf = (members: Workspace[]) =>
    members.map((workspace) => (
      <WorkspaceRow
        key={workspace.id}
        state={state}
        workspace={workspace}
        selected={workspace.id === selectedId}
        index={indexOf(workspace)}
      />
    ));
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
          {collapsed ? (
            <HiddenWaitingDot
              state={state}
              workspaces={workspaces}
              asks={asks}
            />
          ) : null}
        </button>
        <span className="hidden gap-0.5 group-hover:flex has-[[role=menu]]:flex">
          <IconButton
            icon="settings-2"
            label={`${repo.name} settings`}
            size="sm"
            onClick={() => openSettings(`repo:${repo.id}`)}
          />
          <IconButton
            icon="message-square-plus"
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
            items={moveToFolderItems(
              state.folders,
              folderId,
              moveToFolder,
              () => setNaming(true),
              () => setPicking(true),
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
        <NameDialog
          title="New folder"
          submitLabel="Create"
          onSubmit={createFolderWithRepo}
          onClose={() => setNaming(false)}
        />
      ) : null}
      {picking ? (
        <FolderPickerDialog
          folders={state.folders}
          current={folderId}
          onPick={moveToFolder}
          onClose={() => setPicking(false)}
        />
      ) : null}
      {collapsed ? null : (
        <div className="mt-0.5 flex flex-col gap-0.5">
          {folderRuns(workspaces).map((run) => {
            const folder = state.workspaceFolders.find(
              (entry) => entry.id === run.folderId,
            );
            const entries = entriesOf(run.workspaces);
            return folder ? (
              <WorkspaceFolderSection
                key={folder.id}
                state={state}
                folder={folder}
                workspaces={run.workspaces}
              >
                {entries}
              </WorkspaceFolderSection>
            ) : (
              <Fragment key={run.workspaces[0].id}>{entries}</Fragment>
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
          {asks.length ? (
            <AsksFold state={state} repoId={repo.id} asks={asks} />
          ) : null}
          <AlsoAcrossRepos counts={acrossRepos} />
        </div>
      )}
    </section>
  );
}

function FolderSection({
  state,
  folder,
  workspaces,
  asks,
  children,
}: {
  state: AppState;
  folder: RepoFolder;
  workspaces: Workspace[];
  asks: AskChat[];
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
          {collapsed ? (
            <HiddenWaitingDot
              state={state}
              workspaces={workspaces}
              asks={asks}
            />
          ) : null}
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
        <NameDialog
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

interface NavEntry {
  id: string;
  icon: IconName;
  label: string;
  hint?: string;
  page: Page['kind'] | null;
  shown?: (state: AppState) => boolean;
  open: () => void;
}

const NEW_ASK_ID = 'ask';
const SHOW_IN_SIDEBAR = 'Show in sidebar';

const NAV_ENTRIES: NavEntry[] = [
  {
    id: 'search',
    icon: 'search',
    label: 'Search',
    hint: '⌘K',
    page: null,
    open: () => setUi({ palette: 'all' }),
  },
  {
    id: 'new-workspace',
    icon: 'square-pen',
    label: 'New workspace',
    hint: '⌘N',
    page: 'new-workspace',
    open: () => openNewWorkspace(null),
  },
  {
    id: 'grid',
    icon: 'layout-grid',
    label: 'Grid',
    hint: '⌘G',
    page: 'grid',
    open: openGrid,
  },
  {
    id: 'board',
    icon: 'square-kanban',
    label: 'Board',
    hint: '⌘⇧B',
    page: 'board',
    open: openBoard,
  },
  {
    id: 'pull-requests',
    icon: 'git-pull-request',
    label: 'Pull requests',
    page: 'pull-requests',
    open: openPullRequests,
  },
  {
    id: 'runs',
    icon: 'network',
    label: 'Runs',
    page: 'runs',
    shown: (state) => state.runs.length > 0,
    open: openRuns,
  },
  {
    id: 'automations',
    icon: 'calendar-clock',
    label: 'Automations',
    page: 'automations',
    open: openAutomations,
  },
  {
    id: NEW_ASK_ID,
    icon: 'message-square-plus',
    label: 'New Ask',
    page: 'ask',
    open: () => openAsk(null),
  },
];

function useActiveNavEntry(): (entry: NavEntry) => boolean {
  const pageKind = useUi((ui) => ui.page.kind);
  const paletteOpen = useUi((ui) => ui.palette !== false);
  const askChatOpen = useSelectedAskId() !== null;
  return (entry) => {
    if (entry.page === null) return paletteOpen;
    if (entry.id === NEW_ASK_ID && askChatOpen) return false;
    return entry.page === pageKind;
  };
}

function Pages({ state }: { state: AppState }) {
  const hidden = useUi((ui) => ui.hiddenNavEntries);
  const compact = useUi((ui) => ui.compactNav);
  const isActive = useActiveNavEntry();
  const entries = NAV_ENTRIES.filter(
    (entry) => !hidden.includes(entry.id) && (entry.shown?.(state) ?? true),
  );
  if (!entries.length) return null;
  if (compact) {
    return (
      <div
        role="group"
        aria-label="Pages"
        className="flex justify-between border-b border-border-1 px-2 pb-2"
      >
        {entries.map((entry) => (
          <IconButton
            key={entry.id}
            icon={entry.icon}
            label={entry.label}
            title={entry.label}
            size="sm"
            aria-current={isActive(entry) ? 'page' : undefined}
            className={cn(isActive(entry) && 'bg-active text-fg-1')}
            onClick={entry.open}
          />
        ))}
      </div>
    );
  }
  return (
    <div
      role="group"
      aria-label="Pages"
      className="flex flex-col gap-0.5 border-b border-border-1 px-2 pb-2"
    >
      {entries.map((entry) => (
        <NavRow
          key={entry.id}
          icon={entry.icon}
          label={entry.label}
          hint={entry.hint}
          active={isActive(entry)}
          onClick={entry.open}
        />
      ))}
    </div>
  );
}

function CustomizeSidebarMenu() {
  const hidden = useUi((ui) => ui.hiddenNavEntries);
  const compact = useUi((ui) => ui.compactNav);
  return (
    <Menu
      label="Customize sidebar"
      align="right"
      items={[
        {
          id: 'compact',
          label: 'Compact navigation',
          icon: 'rows-2',
          checked: compact,
          keepOpen: true,
          onSelect: toggleCompactNav,
        },
        ...NAV_ENTRIES.map((entry) => ({
          id: entry.id,
          label: entry.label,
          icon: entry.icon,
          checked: !hidden.includes(entry.id),
          keepOpen: true,
          section: SHOW_IN_SIDEBAR,
          onSelect: () =>
            setUi((ui) => ({
              hiddenNavEntries: toggled(ui.hiddenNavEntries, entry.id),
            })),
        })),
      ]}
      trigger={({ toggle }) => (
        <IconButton
          icon="sliders-horizontal"
          label="Customize sidebar"
          size="sm"
          className={NO_DRAG}
          onClick={toggle}
        />
      )}
    />
  );
}

interface ArchivedEntry {
  id: string;
  label: string;
  title: string;
  archivedAt: string;
  restore: () => void;
  remove: () => void;
}

function archivedEntries(state: AppState): ArchivedEntry[] {
  const workspaces = state.workspaces
    .filter((ws) => ws.archivedAt)
    .map((workspace) => ({
      id: workspace.id,
      label: workspaceLabel(workspace),
      title: workspace.branch,
      archivedAt: workspace.archivedAt ?? workspace.createdAt,
      restore: () => void restoreWorkspace(workspace),
      remove: () => void api.deleteWorkspace(workspace.id),
    }));
  const asks = state.askChats
    .filter((ask) => ask.archivedAt)
    .map((ask) => ({
      id: ask.id,
      label: ask.session.title,
      title: ask.session.title,
      archivedAt: ask.archivedAt ?? ask.createdAt,
      restore: () => void restoreAsk(ask),
      remove: () => void deleteAsk(ask),
    }));
  return [...workspaces, ...asks].sort((a, b) =>
    b.archivedAt.localeCompare(a.archivedAt),
  );
}

function History({ state }: { state: AppState }) {
  const open = useUi((ui) => ui.historyOpen);
  const archived = archivedEntries(state);
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
          {archived.map((entry) => (
            <div
              key={entry.id}
              className="group flex h-8 items-center gap-2 rounded-md px-2 text-sm text-fg-3 hover:bg-hover"
            >
              <Icon name="archive" size={13} />
              <span className="min-w-0 flex-1 truncate" title={entry.title}>
                {entry.label}
                <span className="ml-1.5 text-xs text-fg-4">
                  {timeAgo(entry.archivedAt)}
                </span>
              </span>
              <span className="hidden gap-0.5 group-hover:flex">
                <IconButton
                  icon="archive-restore"
                  label={`Unarchive ${entry.label}`}
                  size="sm"
                  onClick={entry.restore}
                />
                <IconButton
                  icon="trash-2"
                  label={`Delete ${entry.label}`}
                  size="sm"
                  onClick={entry.remove}
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
  const active = activeWorkspaces(state);
  const leads = crossRepoLeads(state);
  const asks = askSections(state);
  const indexOf = (workspace: Workspace) => active.indexOf(workspace);
  const workspacesOf = (repo: Repo) =>
    active.filter((ws) => ws.repoId === repo.id && !isAcrossRepos(leads, ws));
  const asksOf = (repo: Repo) => asks.byRepo.get(repo.id) ?? [];
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
        <CustomizeSidebarMenu />
        <HandsFreeButton />
        <IconButton
          icon="panel-left"
          label="Hide sidebar"
          size="sm"
          className={NO_DRAG}
          onClick={() => setUi({ sidebar: false })}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <Pages state={state} />
        <div className="flex-1 px-2 pt-1">
          <WaitingForYou state={state} selectedId={selectedId} />
          <AcrossRepos
            state={state}
            groups={sidebarEntries(
              active.filter((ws) => isAcrossRepos(leads, ws)),
              leads,
            )}
            asks={asks.acrossRepos}
            leads={leads}
            selectedId={selectedId}
            indexOf={indexOf}
          />
          {repoSections(state).map(({ folder, repos }) => {
            const groups = repos.map((repo) => (
              <RepoGroup
                key={repo.id}
                state={state}
                repo={repo}
                folderId={folder?.id ?? null}
                workspaces={workspacesOf(repo)}
                asks={asksOf(repo)}
                acrossRepos={acrossReposIn(state, repo.id)}
                selectedId={selectedId}
                indexOf={indexOf}
              />
            ));
            return folder ? (
              <FolderSection
                key={folder.id}
                state={state}
                folder={folder}
                workspaces={repos.flatMap(workspacesOf)}
                asks={repos.flatMap(asksOf)}
              >
                {groups}
              </FolderSection>
            ) : (
              <Fragment key={repos[0].id}>{groups}</Fragment>
            );
          })}
          <RootEndDropZone />
          <NoRepository state={state} asks={asks.noRepo} />
        </div>
        <History state={state} />
      </div>
      <div className="flex flex-none items-center gap-1 border-t border-border-1 p-2">
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
