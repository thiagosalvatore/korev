import { useSyncExternalStore } from 'react';
import type { DiffComment } from '../../korev-desktop/src/shared/comments';
import type { DiffRow } from '../../korev-desktop/src/shared/diff';

export type DiffItem =
  | { kind: 'row'; row: DiffRow; index: number }
  | { kind: 'note'; comment: DiffComment };

const NONE: DiffComment[] = [];

// Drafts live until they are sent, across every diff of the workspace,
// like the desktop keeps them per workspace.
let drafts: ReadonlyMap<string, DiffComment[]> = new Map();
const listeners = new Set<() => void>();
let lastId = 0;

function update(workspaceId: string, next: DiffComment[]) {
  drafts = new Map(drafts).set(workspaceId, next);
  listeners.forEach((listener) => listener());
}

export function commentsOf(workspaceId: string): DiffComment[] {
  return drafts.get(workspaceId) ?? NONE;
}

export function addComment(
  workspaceId: string,
  comment: Omit<DiffComment, 'id'>,
) {
  update(workspaceId, [
    ...commentsOf(workspaceId),
    { ...comment, id: `comment-${++lastId}` },
  ]);
}

export function removeComment(workspaceId: string, commentId: string) {
  update(
    workspaceId,
    commentsOf(workspaceId).filter((comment) => comment.id !== commentId),
  );
}

export function clearComments(workspaceId: string) {
  update(workspaceId, NONE);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useDiffComments(workspaceId: string): DiffComment[] {
  return useSyncExternalStore(subscribe, () => commentsOf(workspaceId));
}

export function canComment(row: DiffRow): boolean {
  return row.type !== 'hunk' && row.newLine !== null;
}

export function withNotes(
  rows: DiffRow[],
  file: string,
  comments: DiffComment[],
): DiffItem[] {
  const mine = comments.filter((comment) => comment.file === file);
  return rows.flatMap((row, index): DiffItem[] => [
    { kind: 'row', row, index },
    ...(canComment(row)
      ? mine
          .filter((comment) => comment.line === row.newLine)
          .map((comment) => ({ kind: 'note' as const, comment }))
      : []),
  ]);
}
