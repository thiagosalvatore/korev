import { useSyncExternalStore } from 'react';
import type { TerminalKind } from '../shared/model';

export type MainTab =
  | { kind: 'chat'; sessionId: string }
  | { kind: 'diff'; file: string | null }
  | { kind: 'file'; file: string };

export type GitPanelTab = 'files' | 'changes' | 'checks';

export type Page =
  | { kind: 'workspace' }
  | { kind: 'new-workspace'; repoId: string | null }
  | { kind: 'ask'; askChatId: string | null; repoIds: string[] }
  | { kind: 'settings'; section: string };

export interface DiffComment {
  id: string;
  file: string;
  line: number;
  code: string;
  body: string;
}

export interface WorkspaceUi {
  extraTabs: MainTab[];
  activeKey: string | null;
  terminalTab: TerminalKind;
  comments: DiffComment[];
}

export function tabKey(tab: MainTab): string {
  if (tab.kind === 'chat') return `chat:${tab.sessionId}`;
  if (tab.kind === 'file') return `file:${tab.file}`;
  return 'diff';
}

export interface UiState {
  page: Page;
  workspaceId: string | null;
  sidebar: boolean;
  panel: boolean;
  terminal: boolean;
  gitTab: GitPanelTab;
  collapsedRepos: string[];
  historyOpen: boolean;
  workspaces: Record<string, WorkspaceUi>;
  palette: boolean;
}

const STORAGE_KEY = 'korev:ui';

const INITIAL: UiState = {
  page: { kind: 'workspace' },
  workspaceId: null,
  sidebar: true,
  panel: true,
  terminal: true,
  gitTab: 'changes',
  collapsedRepos: [],
  historyOpen: false,
  workspaces: {},
  palette: false,
};

export const EMPTY_WORKSPACE_UI: WorkspaceUi = {
  extraTabs: [],
  activeKey: null,
  terminalTab: 'shell',
  comments: [],
};

function load(): UiState {
  try {
    const saved = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? 'null',
    ) as Partial<UiState> | null;
    return { ...INITIAL, ...saved, palette: false };
  } catch {
    return INITIAL;
  }
}

let state: UiState = load();
const listeners = new Set<() => void>();

export function getUi(): UiState {
  return state;
}

export function setUi(
  update: Partial<UiState> | ((current: UiState) => Partial<UiState>),
) {
  const patch = typeof update === 'function' ? update(state) : update;
  state = { ...state, ...patch };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  listeners.forEach((listener) => listener());
}

export function updateWorkspaceUi(
  workspaceId: string,
  update: (current: WorkspaceUi) => Partial<WorkspaceUi>,
) {
  setUi((current) => {
    const existing = current.workspaces[workspaceId] ?? EMPTY_WORKSPACE_UI;
    return {
      workspaces: {
        ...current.workspaces,
        [workspaceId]: { ...existing, ...update(existing) },
      },
    };
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useUi<T>(select: (ui: UiState) => T): T {
  return useSyncExternalStore(subscribe, () => select(state));
}

export function resetUiForTests() {
  state = INITIAL;
}
