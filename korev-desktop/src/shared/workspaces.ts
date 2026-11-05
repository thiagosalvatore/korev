import type {
  AppState,
  AskChat,
  Repo,
  RepoFolder,
  Workspace,
  WorkspaceRuntime,
  WorkspaceStatus,
} from './model';

export interface RepoSection {
  folder: RepoFolder | null;
  repos: Repo[];
}

export function repoSections(state: AppState): RepoSection[] {
  const folderIds = new Set(state.folders.map((folder) => folder.id));
  const folderOf = (repo: Repo) =>
    repo.folderId && folderIds.has(repo.folderId) ? repo.folderId : null;
  const inFolder = (folderId: string) =>
    state.repos.filter((repo) => folderOf(repo) === folderId);
  return state.rootOrder.flatMap((id): RepoSection[] => {
    const folder = state.folders.find((entry) => entry.id === id);
    if (folder) return [{ folder, repos: inFolder(folder.id) }];
    const repo = state.repos.find((entry) => entry.id === id);
    return repo ? [{ folder: null, repos: [repo] }] : [];
  });
}

const RECENT_REPO_COUNT = 3;

export interface PickerRepo {
  repo: Repo;
  recent: boolean;
}

export function pickerRepos(
  state: Pick<AppState, 'repos' | 'workspaces' | 'askChats'>,
): PickerRepo[] {
  const lastUsed = new Map<string, string>();
  const use = (repoId: string, at: string) => {
    if (at > (lastUsed.get(repoId) ?? '')) lastUsed.set(repoId, at);
  };
  for (const workspace of state.workspaces)
    use(workspace.repoId, workspace.createdAt);
  for (const ask of state.askChats)
    for (const repoId of ask.repoIds) use(repoId, ask.createdAt);
  const recent = state.repos
    .filter((repo) => lastUsed.has(repo.id))
    .sort((a, b) => lastUsed.get(b.id)!.localeCompare(lastUsed.get(a.id)!))
    .slice(0, RECENT_REPO_COUNT);
  const rest = state.repos
    .filter((repo) => !recent.includes(repo))
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );
  return [
    ...recent.map((repo) => ({ repo, recent: true })),
    ...rest.map((repo) => ({ repo, recent: false })),
  ];
}

export type SidebarOrder = Pick<AppState, 'repos' | 'folders' | 'rootOrder'>;

export type MovedOrder = Pick<AppState, 'repos' | 'rootOrder'>;

export interface RepoDestination {
  folderId: string | null;
  beforeId: string | null;
}

function moveBefore<T extends { id: string }>(
  items: T[],
  item: T,
  beforeId: string | null,
): T[] {
  if (beforeId === item.id) return items;
  const rest = items.filter((entry) => entry.id !== item.id);
  const index = rest.findIndex((entry) => entry.id === beforeId);
  rest.splice(index === -1 ? rest.length : index, 0, item);
  return rest;
}

export function rootItems({
  repos,
  folders,
  rootOrder,
}: SidebarOrder): (Repo | RepoFolder)[] {
  const inFolder = (repo: Repo) =>
    folders.some((folder) => folder.id === repo.folderId);
  const unordered = [...repos.filter((repo) => !inFolder(repo)), ...folders];
  const ordered = rootOrder.flatMap(
    (id) => unordered.find((item) => item.id === id) ?? [],
  );
  return [...ordered, ...unordered.filter((item) => !ordered.includes(item))];
}

function rootOrderWith(
  order: SidebarOrder,
  item: Repo | RepoFolder,
  beforeId: string | null,
): string[] {
  return moveBefore(rootItems(order), item, beforeId).map((entry) => entry.id);
}

export function movedRepo(
  order: SidebarOrder,
  repoId: string,
  { folderId, beforeId }: RepoDestination,
): MovedOrder {
  const repo = order.repos.find((entry) => entry.id === repoId);
  if (!repo) return order;
  const moved = { ...repo, folderId };
  const repos = order.repos.map((entry) => (entry === repo ? moved : entry));
  if (folderId !== null)
    return {
      repos: moveBefore(repos, moved, beforeId),
      rootOrder: order.rootOrder,
    };
  return {
    repos,
    rootOrder: rootOrderWith({ ...order, repos }, moved, beforeId),
  };
}

export function movedFolder(
  order: SidebarOrder,
  folderId: string,
  beforeId: string | null,
): MovedOrder {
  const folder = order.folders.find((entry) => entry.id === folderId);
  if (!folder) return order;
  return {
    repos: order.repos,
    rootOrder: rootOrderWith(order, folder, beforeId),
  };
}

function newestFirst(asks: AskChat[]): AskChat[] {
  return asks.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
}

export function asksNewestFirst(state: Pick<AppState, 'askChats'>): AskChat[] {
  return newestFirst(state.askChats.filter((ask) => !ask.automationRun));
}

export interface AskSections {
  acrossRepos: AskChat[];
  byRepo: Map<string, AskChat[]>;
  noRepo: AskChat[];
}

export function askSections(state: Pick<AppState, 'askChats'>): AskSections {
  const sections: AskSections = {
    acrossRepos: [],
    byRepo: new Map(),
    noRepo: [],
  };
  for (const ask of asksNewestFirst(state)) {
    const [repoId, ...others] = ask.repoIds;
    if (!repoId) sections.noRepo.push(ask);
    else if (others.length) sections.acrossRepos.push(ask);
    else
      sections.byRepo.set(repoId, [
        ...(sections.byRepo.get(repoId) ?? []),
        ask,
      ]);
  }
  return sections;
}

export function asksWaitingForYou(
  state: Pick<AppState, 'askChats' | 'waitingSessions'>,
): AskChat[] {
  return asksNewestFirst(state).filter((ask) =>
    state.waitingSessions.includes(ask.session.id),
  );
}

export function reviewChatOf(
  state: Pick<AppState, 'askChats'>,
  prUrl: string,
): AskChat | undefined {
  return state.askChats.find((ask) => ask.reviewOf === prUrl);
}

export function workspaceOfPr(
  state: Pick<AppState, 'workspaces'>,
  prUrl: string,
): Workspace | undefined {
  return state.workspaces.find((workspace) =>
    workspace.prs.some((tracked) => tracked.url === prUrl),
  );
}

export function automationRunsNewestFirst(
  state: Pick<AppState, 'askChats'>,
  automationId: string,
): AskChat[] {
  return newestFirst(
    state.askChats.filter(
      (ask) => ask.automationRun?.automationId === automationId,
    ),
  );
}

const ACROSS_REPOS_ORDER = -1;

export function activeWorkspaces(state: AppState): Workspace[] {
  const repoOrder = new Map(
    repoSections(state)
      .flatMap((section) => section.repos)
      .map((repo, index) => [repo.id, index]),
  );
  const active = state.workspaces.filter((ws) => !ws.archivedAt);
  const leads = crossRepoLeads(state);
  const folderOf = (ws: Workspace) =>
    isAcrossRepos(leads, ws) ? null : (ws.folderId ?? null);
  const groupStart = startTimes(active, (ws) => ws.groupId);
  const folderStart = startTimes(active, folderOf);
  const groupStartOf = (ws: Workspace) =>
    (ws.groupId && groupStart.get(ws.groupId)) || ws.createdAt;
  const startOf = (ws: Workspace) => {
    const folderId = folderOf(ws);
    return (folderId && folderStart.get(folderId)) || groupStartOf(ws);
  };
  const orderOf = (ws: Workspace) =>
    isAcrossRepos(leads, ws)
      ? ACROSS_REPOS_ORDER
      : (repoOrder.get(ws.repoId) ?? 0);
  return active.sort(
    (a, b) =>
      orderOf(a) - orderOf(b) ||
      startOf(a).localeCompare(startOf(b)) ||
      (folderOf(a) ?? '').localeCompare(folderOf(b) ?? '') ||
      groupStartOf(a).localeCompare(groupStartOf(b)) ||
      (a.groupId ?? a.id).localeCompare(b.groupId ?? b.id) ||
      a.createdAt.localeCompare(b.createdAt),
  );
}

function activeGroups(state: AppState): Map<string, Workspace[]> {
  const groups = new Map<string, Workspace[]>();
  for (const ws of state.workspaces) {
    if (!ws.groupId || ws.archivedAt) continue;
    groups.set(ws.groupId, [...(groups.get(ws.groupId) ?? []), ws]);
  }
  return groups;
}

export function crossRepoLeads(state: AppState): Map<string, Workspace> {
  const leads = new Map<string, Workspace>();
  for (const [groupId, members] of activeGroups(state)) {
    if (new Set(members.map((ws) => ws.repoId)).size < 2) continue;
    const created = members.find(
      (ws) => state.runtime[ws.id]?.status !== 'failed',
    );
    leads.set(groupId, created ?? members[0]);
  }
  return leads;
}

export function isAcrossRepos(
  leads: Map<string, Workspace>,
  workspace: Workspace,
): boolean {
  return workspace.groupId !== null && leads.has(workspace.groupId);
}

export interface AcrossReposCounts {
  linked: number;
  asks: number;
}

export function acrossReposIn(
  state: AppState,
  repoId: string,
): AcrossReposCounts {
  const leads = crossRepoLeads(state);
  const linkedGroups = new Set(
    state.workspaces
      .filter(
        (ws) =>
          !ws.archivedAt && ws.repoId === repoId && isAcrossRepos(leads, ws),
      )
      .map((ws) => ws.groupId),
  );
  return {
    linked: linkedGroups.size,
    asks: askSections(state).acrossRepos.filter((ask) =>
      ask.repoIds.includes(repoId),
    ).length,
  };
}

export interface FolderRun {
  folderId: string | null;
  workspaces: Workspace[];
}

export function folderRuns(workspaces: Workspace[]): FolderRun[] {
  const runs: FolderRun[] = [];
  for (const workspace of workspaces) {
    const folderId = workspace.folderId ?? null;
    const last = runs.at(-1);
    if (last?.folderId === folderId) last.workspaces.push(workspace);
    else runs.push({ folderId, workspaces: [workspace] });
  }
  return runs;
}

export function crossRepoLead(
  state: AppState,
  workspace: Workspace,
): Workspace | null {
  if (!workspace.groupId) return null;
  return crossRepoLeads(state).get(workspace.groupId) ?? null;
}

export function groupRepoName(
  state: AppState,
  workspace: Workspace,
): string | null {
  if (!crossRepoLead(state, workspace)) return null;
  return state.repos.find((repo) => repo.id === workspace.repoId)?.name ?? null;
}

export function waitsForLane(state: AppState, workspace: Workspace): boolean {
  const lead = crossRepoLead(state, workspace);
  return workspace.awaitsLane && lead !== null && lead.id !== workspace.id;
}

function startTimes(
  workspaces: Workspace[],
  keyOf: (workspace: Workspace) => string | null,
): Map<string, string> {
  const starts = new Map<string, string>();
  for (const ws of workspaces) {
    const key = keyOf(ws);
    if (!key) continue;
    const start = starts.get(key);
    if (!start || ws.createdAt < start) starts.set(key, ws.createdAt);
  }
  return starts;
}

export function workspaceLabel(workspace: Workspace) {
  return workspace.label ?? workspace.name;
}

export const WORKTREE_FAILED = 'Could not create the worktree';

export function worktreeProgress(
  workspace: Workspace,
  runtime: WorkspaceRuntime,
) {
  if (runtime.status === 'archiving')
    return {
      title: `Archiving ${workspaceLabel(workspace)}`,
      detail: 'Stopping agents and removing the worktree.',
    };
  return {
    title: `Creating ${workspaceLabel(workspace)}`,
    detail: `Fetching origin/${workspace.baseBranch} and adding a worktree. You can keep working elsewhere.`,
  };
}

export function laneRepos(state: AppState, workspace: Workspace): Repo[] {
  const members = state.workspaces.filter(
    (ws) =>
      ws.groupId !== null && ws.groupId === workspace.groupId && !ws.archivedAt,
  );
  const repoIds = new Set([
    workspace.repoId,
    ...members.map((member) => member.repoId),
  ]);
  if (repoIds.size < 2) return [];
  return [...repoIds].flatMap((repoId) => {
    const repo = state.repos.find((entry) => entry.id === repoId);
    return repo ? [repo] : [];
  });
}

export function sidebarEntries(
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

export type BoardColumn = 'needs-you' | 'working' | 'done' | 'idle';

const BOARD_COLUMN_BY_STATUS: Record<
  Exclude<WorkspaceStatus, 'idle'>,
  BoardColumn
> = {
  waiting: 'needs-you',
  failed: 'needs-you',
  working: 'working',
  'setting-up': 'working',
  creating: 'working',
  archiving: 'working',
};

export function boardColumn(runtime: WorkspaceRuntime): BoardColumn {
  if (runtime.status !== 'idle') return BOARD_COLUMN_BY_STATUS[runtime.status];
  if (runtime.setupError) return 'needs-you';
  return runtime.unread ? 'done' : 'idle';
}

const WAITING_FOR_YOU_COLUMNS: BoardColumn[] = ['needs-you', 'done'];

export function waitsForYou(runtime: WorkspaceRuntime | undefined): boolean {
  return (
    runtime !== undefined &&
    WAITING_FOR_YOU_COLUMNS.includes(boardColumn(runtime))
  );
}

export function workspacesWaitingForYou(state: AppState): Workspace[] {
  const active = activeWorkspaces(state);
  return WAITING_FOR_YOU_COLUMNS.flatMap((column) =>
    active.filter((workspace) => {
      const runtime = state.runtime[workspace.id];
      return runtime !== undefined && boardColumn(runtime) === column;
    }),
  );
}
