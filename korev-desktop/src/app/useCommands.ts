import { useEffect, useRef } from 'react';
import type { AppCommand, AppState, Workspace } from '../shared/model';
import {
  activeSessionId,
  activeWorkspaces,
  archiveWorkspace,
  closeTab,
  createPr,
  fixErrors,
  focusComposer,
  mergePr,
  newChat,
  openDiff,
  openSearch,
  openIn,
  openNewWorkspace,
  openSettings,
  selectWorkspace,
  toggleRunScript,
} from './actions';
import { api, on } from './bridge';
import { EMPTY_WORKSPACE_UI, getUi, setUi } from './ui-store';

const SELECT_WORKSPACE_PREFIX = 'select-workspace-';
const THEME_CYCLE = { dark: 'light', light: 'dark', system: 'light' } as const;

function currentWorkspace(state: AppState): Workspace | null {
  const ui = getUi();
  if (ui.page.kind !== 'workspace') return null;
  return state.workspaces.find((ws) => ws.id === ui.workspaceId) ?? null;
}

function stepWorkspace(state: AppState, step: number) {
  const list = activeWorkspaces(state);
  if (!list.length) return;
  const index = list.findIndex((ws) => ws.id === getUi().workspaceId);
  selectWorkspace(list[(index + step + list.length) % list.length].id);
}

function activeTabKey(workspace: Workspace): string {
  return (
    (getUi().workspaces[workspace.id] ?? EMPTY_WORKSPACE_UI).activeKey ??
    `chat:${activeSessionId(workspace)}`
  );
}

export function runCommand(state: AppState, command: AppCommand) {
  const workspace = currentWorkspace(state);
  if (command.startsWith(SELECT_WORKSPACE_PREFIX)) {
    const target =
      activeWorkspaces(state)[
        Number(command.slice(SELECT_WORKSPACE_PREFIX.length)) - 1
      ];
    if (target) selectWorkspace(target.id);
    return;
  }
  switch (command) {
    case 'new-workspace':
      return openNewWorkspace(workspace?.repoId ?? null);
    case 'show-settings':
      return openSettings();
    case 'show-palette':
      return setUi({ palette: getUi().palette ? false : 'all' });
    case 'quick-open':
      return setUi({ palette: getUi().palette ? false : 'files' });
    case 'toggle-sidebar':
      return setUi({ sidebar: !getUi().sidebar });
    case 'toggle-panel':
      return setUi({ panel: !getUi().panel });
    case 'toggle-terminal':
      return setUi((ui) => ({
        terminal: !(ui.terminal && ui.panel),
        panel: true,
      }));
    case 'toggle-zen': {
      const zen = !getUi().sidebar && !getUi().panel;
      return setUi({ sidebar: zen, panel: zen });
    }
    case 'toggle-theme':
      return void api.updateSettings({
        theme: THEME_CYCLE[state.settings.theme],
      });
    case 'previous-workspace':
      return stepWorkspace(state, -1);
    case 'next-workspace':
      return stepWorkspace(state, 1);
    case 'focus-composer':
      return focusComposer();
    default:
      break;
  }
  if (!workspace || workspace.archivedAt) return;
  switch (command) {
    case 'new-chat':
      return void newChat(workspace, state.settings.defaultAgent);
    case 'close-tab':
      return void closeTab(workspace, activeTabKey(workspace));
    case 'archive-workspace':
      return void archiveWorkspace(state, workspace);
    case 'open-in':
      return void openIn(workspace, state.settings.editor);
    case 'create-pr':
      return void createPr(workspace);
    case 'merge-pr':
      return void mergePr(workspace);
    case 'fix-errors':
      return void fixErrors(workspace);
    case 'open-diff':
      return openDiff(workspace.id);
    case 'search-files':
      return openSearch(workspace.id);
    case 'run-script':
      return void toggleRunScript(state, workspace);
    case 'cancel-agent':
      return void api.stop(activeSessionId(workspace));
    default:
      return undefined;
  }
}

export function useCommands(state: AppState | null) {
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  });
  useEffect(() => {
    const stopCommands = on('command', (command) => {
      if (latest.current) runCommand(latest.current, command);
    });
    const stopFocus = on('focus-workspace', (workspaceId) =>
      selectWorkspace(workspaceId),
    );
    return () => {
      stopCommands();
      stopFocus();
    };
  }, []);
}
