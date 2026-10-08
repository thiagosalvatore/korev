import type { AppState, ChatSession, Workspace } from '../shared/model';
import { GRID_PANES, tabKey, type GridLayout, type GridPane } from './ui-store';

export const GRID_LAYOUTS: Record<GridLayout, { cols: number; rows: number }> =
  {
    '2x1': { cols: 2, rows: 1 },
    '1x2': { cols: 1, rows: 2 },
    '2x2': { cols: 2, rows: 2 },
  };

export type PaneContent = {
  kind: 'chat';
  workspace: Workspace;
  session: ChatSession;
};

export function paneCount(layout: GridLayout): number {
  const { cols, rows } = GRID_LAYOUTS[layout];
  return cols * rows;
}

function samePane(a: GridPane, b: GridPane): boolean {
  return a.workspaceId === b.workspaceId && a.tabKey === b.tabKey;
}

export function placeInPane(
  panes: (GridPane | null)[],
  index: number,
  pane: GridPane | null,
): (GridPane | null)[] {
  return Array.from({ length: GRID_PANES }, (_, slot) => {
    if (slot === index) return pane;
    const current = panes[slot] ?? null;
    return current && pane && samePane(current, pane) ? null : current;
  });
}

export function resolvePane(
  state: AppState,
  pane: GridPane | null,
): PaneContent | null {
  if (!pane) return null;
  const workspace = state.workspaces.find(
    (entry) => entry.id === pane.workspaceId && !entry.archivedAt,
  );
  const session = workspace?.sessions.find(
    (entry) => tabKey({ kind: 'chat', sessionId: entry.id }) === pane.tabKey,
  );
  if (!workspace || !session) return null;
  return { kind: 'chat', workspace, session };
}
