import type {
  AppState,
  Repo,
  RepoFolder,
} from '../../korev-desktop/src/shared/model';
import {
  repoSections,
  type RepoDestination,
} from '../../korev-desktop/src/shared/workspaces';

export type ReorderRow =
  | { kind: 'folder'; id: string; folder: RepoFolder }
  | { kind: 'repo'; id: string; repo: Repo; folderId: string | null };

export type ReorderMove =
  | { kind: 'repo'; repoId: string; destination: RepoDestination }
  | { kind: 'folder'; folderId: string; beforeId: string | null };

export interface RowLayout {
  y: number;
  height: number;
}

export type RowLayouts = Readonly<Record<string, RowLayout>>;

export function reorderRows(state: AppState): ReorderRow[] {
  return repoSections(state).flatMap(({ folder, repos }): ReorderRow[] => {
    const repoRows = repos.map((repo): ReorderRow => ({
      kind: 'repo',
      id: repo.id,
      repo,
      folderId: folder?.id ?? null,
    }));
    if (!folder) return repoRows;
    return [{ kind: 'folder', id: folder.id, folder }, ...repoRows];
  });
}

export function movesWith(row: ReorderRow, dragged: ReorderRow): boolean {
  if (row.id === dragged.id) return true;
  return (
    dragged.kind === 'folder' &&
    row.kind === 'repo' &&
    row.folderId === dragged.id
  );
}

function rowAt(
  rows: ReorderRow[],
  layouts: RowLayouts,
  y: number,
): ReorderRow | null {
  return (
    rows.find((row) => {
      const layout = layouts[row.id];
      return layout && y < layout.y + layout.height;
    }) ?? null
  );
}

function repoDestination(target: ReorderRow | null): RepoDestination {
  if (!target) return { folderId: null, beforeId: null };
  if (target.kind === 'folder') return { folderId: target.id, beforeId: null };
  return { folderId: target.folderId, beforeId: target.id };
}

function rootItemAt(target: ReorderRow | null): string | null {
  if (!target) return null;
  if (target.kind === 'repo') return target.folderId ?? target.id;
  return target.id;
}

export type DropIndicator =
  | { kind: 'before'; id: string }
  | { kind: 'into'; id: string }
  | { kind: 'end' };

export function dropIndicator(move: ReorderMove | null): DropIndicator | null {
  if (!move) return null;
  const beforeId =
    move.kind === 'repo' ? move.destination.beforeId : move.beforeId;
  if (beforeId) return { kind: 'before', id: beforeId };
  if (move.kind === 'repo' && move.destination.folderId)
    return { kind: 'into', id: move.destination.folderId };
  return { kind: 'end' };
}

export function dropTarget(
  rows: ReorderRow[],
  layouts: RowLayouts,
  dragged: ReorderRow,
  y: number,
): ReorderMove | null {
  const target = rowAt(rows, layouts, y);
  if (target && movesWith(target, dragged)) return null;
  if (dragged.kind === 'repo')
    return {
      kind: 'repo',
      repoId: dragged.id,
      destination: repoDestination(target),
    };
  return { kind: 'folder', folderId: dragged.id, beforeId: rootItemAt(target) };
}
