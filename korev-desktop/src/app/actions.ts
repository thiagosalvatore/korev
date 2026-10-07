import type {
  AgentKind,
  AppState,
  EditorId,
  SendOptions,
  Workspace,
} from '../shared/model';
import { api } from './bridge';
import { reportFailure, toast } from './ui/toast';
import {
  EMPTY_WORKSPACE_UI,
  getUi,
  setUi,
  tabKey,
  updateWorkspaceUi,
  type MainTab,
} from './ui-store';

export function activeWorkspaces(state: AppState): Workspace[] {
  const repoOrder = new Map(state.repos.map((repo, index) => [repo.id, index]));
  return state.workspaces
    .filter((ws) => !ws.archivedAt)
    .sort(
      (a, b) =>
        (repoOrder.get(a.repoId) ?? 0) - (repoOrder.get(b.repoId) ?? 0) ||
        a.createdAt.localeCompare(b.createdAt),
    );
}

export function selectWorkspace(workspaceId: string) {
  setUi({ workspaceId, page: { kind: 'workspace' } });
  void api.focusWorkspace(workspaceId);
}

export function openNewWorkspace(repoId: string | null) {
  setUi({ page: { kind: 'new-workspace', repoId } });
  void api.focusWorkspace(null);
}

export function openSettings(section = 'general') {
  setUi({ page: { kind: 'settings', section } });
}

export function activateTab(workspaceId: string, key: string) {
  updateWorkspaceUi(workspaceId, () => ({ activeKey: key }));
}

function openExtraTab(workspaceId: string, tab: MainTab) {
  updateWorkspaceUi(workspaceId, (current) => {
    const key = tabKey(tab);
    const exists = current.extraTabs.some((entry) => tabKey(entry) === key);
    const extraTabs = exists
      ? current.extraTabs.map((entry) => (tabKey(entry) === key ? tab : entry))
      : [...current.extraTabs, tab];
    return { extraTabs, activeKey: key };
  });
}

export function openDiff(workspaceId: string, file: string | null = null) {
  openExtraTab(workspaceId, { kind: 'diff', file });
}

export function openFile(workspaceId: string, file: string) {
  openExtraTab(workspaceId, { kind: 'file', file });
}

export async function newChat(workspace: Workspace, agent: AgentKind) {
  const session = await api.newSession(workspace.id, agent);
  activateTab(workspace.id, tabKey({ kind: 'chat', sessionId: session.id }));
  return session;
}

export function activeSessionId(workspace: Workspace): string {
  const ui = getUi().workspaces[workspace.id] ?? EMPTY_WORKSPACE_UI;
  const key = ui.activeKey ?? '';
  const session = workspace.sessions.find(
    (entry) => key === `chat:${entry.id}`,
  );
  return (session ?? workspace.sessions.at(-1) ?? workspace.sessions[0]).id;
}

export async function closeTab(workspace: Workspace, key: string) {
  const ui = getUi().workspaces[workspace.id] ?? EMPTY_WORKSPACE_UI;
  if (key.startsWith('chat:')) {
    if (workspace.sessions.length <= 1) return;
    await api.closeSession(workspace.id, key.slice('chat:'.length));
  } else {
    updateWorkspaceUi(workspace.id, (current) => ({
      extraTabs: current.extraTabs.filter((tab) => tabKey(tab) !== key),
    }));
  }
  if (ui.activeKey === key)
    updateWorkspaceUi(workspace.id, () => ({ activeKey: null }));
}

export async function createWorkspace(
  repoId: string,
  task: SendOptions | null,
) {
  const created = await api.createWorkspace(repoId, task);
  if (!reportFailure(created)) return null;
  selectWorkspace(created.value.id);
  return created.value;
}

export async function archiveWorkspace(state: AppState, workspace: Workspace) {
  const remaining = activeWorkspaces(state).filter(
    (ws) => ws.id !== workspace.id,
  );
  const result = await api.archiveWorkspace(workspace.id);
  if (!reportFailure(result)) return;
  toast(`Archived ${workspace.name}`, 'neutral');
  if (getUi().workspaceId !== workspace.id) return;
  const next =
    remaining.find((ws) => ws.repoId === workspace.repoId) ?? remaining[0];
  if (next) selectWorkspace(next.id);
  else openNewWorkspace(workspace.repoId);
}

export async function restoreWorkspace(workspace: Workspace) {
  const result = await api.restoreWorkspace(workspace.id);
  if (reportFailure(result)) selectWorkspace(workspace.id);
}

export async function openIn(workspace: Workspace, editor: EditorId) {
  reportFailure(await api.openIn(workspace.id, editor));
}

export async function createPr(workspace: Workspace) {
  reportFailure(await api.createPr(workspace.id, activeSessionId(workspace)));
}

export async function fixErrors(workspace: Workspace) {
  reportFailure(await api.fixChecks(workspace.id, activeSessionId(workspace)));
}

export async function resolveConflicts(workspace: Workspace) {
  reportFailure(
    await api.resolveConflicts(workspace.id, activeSessionId(workspace)),
  );
}

export async function mergePr(workspace: Workspace) {
  const result = await api.mergePr(workspace.id);
  if (reportFailure(result)) toast('Pull request merged', 'success');
}

export async function toggleRunScript(state: AppState, workspace: Workspace) {
  const ref = `${workspace.id}:run`;
  updateWorkspaceUi(workspace.id, () => ({ terminalTab: 'run' }));
  setUi({ terminal: true, panel: true });
  if (state.runningTerminals.includes(ref)) {
    await api.stopScript(workspace.id, 'run');
    return;
  }
  reportFailure(await api.startScript(workspace.id, 'run'));
}

export function focusComposer() {
  document.querySelector<HTMLTextAreaElement>('[data-composer]')?.focus();
}
