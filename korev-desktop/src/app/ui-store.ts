import { useSyncExternalStore } from 'react';
import type { TerminalKind, TerminalPreset, TurnRange } from '../shared/model';

export type MainTab =
  | { kind: 'chat'; sessionId: string }
  | { kind: 'diff'; file: string | null; range?: TurnRange | null }
  | { kind: 'file'; file: string; line?: number | null; editing?: boolean }
  | { kind: 'search' }
  | { kind: 'terminal'; id: string; preset: TerminalPreset }
  | { kind: 'browser'; id: string; url: string };

export type DiffLayout = 'unified' | 'split';

export type PaletteMode = false | 'all' | 'files';

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
  runScriptId?: string | null;
  viewed?: Record<string, string>;
}

export function tabKey(tab: MainTab): string {
  if (tab.kind === 'chat') return `chat:${tab.sessionId}`;
  if (tab.kind === 'file') return `file:${tab.file}`;
  if (tab.kind === 'search') return 'search';
  if (tab.kind === 'terminal') return `terminal:${tab.id}`;
  if (tab.kind === 'browser') return `browser:${tab.id}`;
  return tab.range ? `diff:${tab.range.to}` : 'diff';
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
  palette: PaletteMode;
  diffLayout: DiffLayout;
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
  diffLayout: 'unified',
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
