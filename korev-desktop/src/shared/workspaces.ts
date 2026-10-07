import type { AppState, Repo, RepoFolder, Workspace } from './model';

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

export function activeWorkspaces(state: AppState): Workspace[] {
  const repoOrder = new Map(
    repoSections(state)
      .flatMap((section) => section.repos)
      .map((repo, index) => [repo.id, index]),
  );
  return state.workspaces
    .filter((ws) => !ws.archivedAt)
    .sort(
      (a, b) =>
        (repoOrder.get(a.repoId) ?? 0) - (repoOrder.get(b.repoId) ?? 0) ||
        a.createdAt.localeCompare(b.createdAt),
    );
}
