import type { AppState, ChatSession, Workspace } from '../shared/model';
import {
  GRID_PANES,
  tabKey,
  type GridLayout,
  type GridPane,
  type MainTab,
  type WorkspaceUi,
} from './ui-store';

export const GRID_LAYOUTS: Record<GridLayout, { cols: number; rows: number }> =
  {
    '2x1': { cols: 2, rows: 1 },
    '1x2': { cols: 1, rows: 2 },
    '2x2': { cols: 2, rows: 2 },
  };

export type TerminalTab = Extract<MainTab, { kind: 'terminal' }>;

export type PaneContent =
  | { kind: 'chat'; workspace: Workspace; session: ChatSession }
  | { kind: 'terminal'; workspace: Workspace; terminal: TerminalTab };

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

export function freeTab(
  panes: (GridPane | null)[],
  index: number,
  candidates: GridPane[],
): GridPane | null {
  const shownElsewhere = (candidate: GridPane) =>
    panes.some(
      (pane, slot) => slot !== index && pane && samePane(pane, candidate),
    );
  return candidates.find((candidate) => !shownElsewhere(candidate)) ?? null;
}

export function terminalTabs(
  workspaces: Record<string, WorkspaceUi>,
  workspaceId: string,
): TerminalTab[] {
  return (workspaces[workspaceId]?.extraTabs ?? []).flatMap((tab) =>
    tab.kind === 'terminal' ? [tab] : [],
  );
}

export function resolvePane(
  state: AppState,
  workspaces: Record<string, WorkspaceUi>,
  pane: GridPane | null,
): PaneContent | null {
  if (!pane) return null;
  const workspace = state.workspaces.find(
    (entry) => entry.id === pane.workspaceId && !entry.archivedAt,
  );
  if (!workspace) return null;
  const session = workspace.sessions.find(
    (entry) => tabKey({ kind: 'chat', sessionId: entry.id }) === pane.tabKey,
  );
  if (session) return { kind: 'chat', workspace, session };
  const terminal = terminalTabs(workspaces, workspace.id).find(
    (tab) => tabKey(tab) === pane.tabKey,
  );
  return terminal ? { kind: 'terminal', workspace, terminal } : null;
}
