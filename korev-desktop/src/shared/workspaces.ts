import type {
  AppState,
  AskChat,
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
  const startOf = (ws: Workspace) =>
    (ws.groupId && groupStart.get(ws.groupId)) || ws.createdAt;
  return active.sort(
    (a, b) =>
      (repoOrder.get(a.repoId) ?? 0) - (repoOrder.get(b.repoId) ?? 0) ||
      startOf(a).localeCompare(startOf(b)) ||
      a.createdAt.localeCompare(b.createdAt),
  );
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
