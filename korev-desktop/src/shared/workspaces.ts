import type {
  AppState,
  AskChat,
  LaneRepo,
  Repo,
  RepoFolder,
  Workspace,
  WorkspaceRuntime,
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

export function asksNewestFirst(state: AppState): AskChat[] {
  return [...state.askChats].sort((a, b) =>
    b.lastMessageAt.localeCompare(a.lastMessageAt),
  );
}

export function activeWorkspaces(state: AppState): Workspace[] {
  const repoOrder = new Map(
    repoSections(state)
      .flatMap((section) => section.repos)
      .map((repo, index) => [repo.id, index]),
  );
  const active = state.workspaces.filter((ws) => !ws.archivedAt);
  const groupStart = groupStartTimes(active);
  const leads = crossRepoLeads(state);
  const startOf = (ws: Workspace) =>
    (ws.groupId && groupStart.get(ws.groupId)) || ws.createdAt;
  const orderOf = (ws: Workspace) =>
    repoOrder.get(sidebarRepoId(leads, ws)) ?? 0;
  return active.sort(
    (a, b) =>
      orderOf(a) - orderOf(b) ||
      startOf(a).localeCompare(startOf(b)) ||
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

export function sidebarRepoId(
  leads: Map<string, Workspace>,
  workspace: Workspace,
): string {
  const lead = workspace.groupId ? leads.get(workspace.groupId) : undefined;
  return lead?.repoId ?? workspace.repoId;
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

function groupStartTimes(workspaces: Workspace[]): Map<string, string> {
  const starts = new Map<string, string>();
  for (const ws of workspaces) {
    if (!ws.groupId) continue;
    const start = starts.get(ws.groupId);
    if (!start || ws.createdAt < start) starts.set(ws.groupId, ws.createdAt);
  }
  return starts;
}

export function worktreeProgress(
  workspace: Workspace,
  runtime: WorkspaceRuntime,
) {
  if (runtime.status === 'archiving')
    return {
      title: `Archiving ${workspace.name}`,
      detail: 'Stopping agents and removing the worktree.',
    };
  return {
    title: `Creating ${workspace.name}`,
    detail: `Fetching origin/${workspace.baseBranch} and adding a worktree. You can keep working elsewhere.`,
  };
}

export function laneRepos(state: AppState, workspace: Workspace): LaneRepo[] {
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
    return repo ? [{ id: repo.id, name: repo.name }] : [];
  });
}
