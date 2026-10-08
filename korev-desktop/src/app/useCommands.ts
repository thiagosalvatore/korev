import { useEffect, useRef } from 'react';
import {
  primaryPr,
  type AppCommand,
  type AppState,
  type Workspace,
} from '../shared/model';
import { activeWorkspaces } from '../shared/workspaces';
import {
  activeSessionId,
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
import { toast } from './ui/toast';
import { EMPTY_WORKSPACE_UI, getUi, setUi } from './ui-store';

async function checkForUpdates() {
  if (await api.checkForUpdates()) setUi({ updateOpen: true });
  else toast('Korev is up to date');
}

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
      return openNewWorkspace(null);
    case 'show-settings':
      return openSettings();
    case 'check-updates':
      return void checkForUpdates();
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
    case 'confirm-quit':
      return setUi({ quit: 'asking' });
    default:
      break;
  }
  if (!workspace || workspace.archivedAt) return;
  const pr = primaryPr(
    workspace,
    state.runtime[workspace.id],
    getUi().workspaces[workspace.id]?.prUrl,
  );
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
      return void (pr && mergePr(workspace, pr));
    case 'fix-errors':
      return void (pr && fixErrors(workspace, pr));
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
    const stopToasts = on('toast', ({ title, tone }) => toast(title, tone));
    return () => {
      stopCommands();
      stopFocus();
      stopToasts();
    };
  }, []);
}
