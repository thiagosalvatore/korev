import type {
  AgentKind,
  AskChat,
  AppState,
  EditorId,
  PrStatus,
  PrThread,
  Result,
  SendOptions,
  TerminalPreset,
  TurnRange,
  Workspace,
  WorkspaceSource,
} from '../shared/model';
import { activeWorkspaces } from '../shared/workspaces';
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

export function selectWorkspace(workspaceId: string) {
  setUi({ workspaceId, page: { kind: 'workspace' } });
  void api.focusWorkspace(workspaceId);
}

export function openNewWorkspace(repoId: string | null) {
  setUi({ page: { kind: 'new-workspace', repoId } });
  void api.focusWorkspace(null);
}

export function openAsk(askChatId: string | null, repoIds: string[] = []) {
  setUi({ page: { kind: 'ask', askChatId, repoIds } });
  void api.focusWorkspace(null);
}

export async function startAsk(repoIds: string[], question: SendOptions) {
  const ask = await api.createAskChat(repoIds);
  openAsk(ask.id);
  return reportFailure(
    await api.send(ask.session.id, {
      ...question,
      model: question.model || ask.session.model,
    }),
  );
}

export async function deleteAsk(ask: AskChat) {
  await api.deleteAskChat(ask.id);
  const page = getUi().page;
  if (page.kind === 'ask' && page.askChatId === ask.id)
    openAsk(null, ask.repoIds);
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

export function openDiff(
  workspaceId: string,
  file: string | null = null,
  range: TurnRange | null = null,
) {
  openExtraTab(workspaceId, { kind: 'diff', file, range });
}

export function openFile(
  workspaceId: string,
  file: string,
  options: { line?: number | null; editing?: boolean } = {},
) {
  openExtraTab(workspaceId, { kind: 'file', file, ...options });
}

export function openSearch(workspaceId: string) {
  openExtraTab(workspaceId, { kind: 'search' });
}

export function openComments(workspaceId: string) {
  openExtraTab(workspaceId, { kind: 'comments' });
}

const CONVERSATION_FILE = 'PR conversation';

export function addThreadToChat(
  workspaceId: string,
  thread: PrThread,
  code = '',
) {
  const id = `gh-${thread.id}`;
  const body = thread.comments
    .map((comment) => `@${comment.author} on GitHub: ${comment.body}`)
    .join('\n  ');
  updateWorkspaceUi(workspaceId, (current) =>
    current.comments.some((comment) => comment.id === id)
      ? {}
      : {
          comments: [
            ...current.comments,
            {
              id,
              file: thread.path ?? CONVERSATION_FILE,
              line: thread.line ?? 0,
              code,
              body,
            },
          ],
        },
  );
}

function tabId(): string {
  return Date.now().toString(36);
}

export function terminalTabRef(workspaceId: string, id: string): string {
  return `${workspaceId}:tab-${id}`;
}

export function openTerminalTab(workspaceId: string, preset: TerminalPreset) {
  openExtraTab(workspaceId, { kind: 'terminal', id: tabId(), preset });
}

export function openBrowser(workspaceId: string, url: string) {
  openExtraTab(workspaceId, { kind: 'browser', id: tabId(), url });
}

export async function newChat(workspace: Workspace, agent: AgentKind) {
  const session = await api.newSession(workspace.id, agent);
  activateTab(workspace.id, tabKey({ kind: 'chat', sessionId: session.id }));
  return session;
}

export async function handoffPlan(workspace: Workspace, sessionId: string) {
  const result = await api.handoffPlan(sessionId);
  if (!reportFailure(result)) return;
  activateTab(workspace.id, tabKey({ kind: 'chat', sessionId: result.value }));
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
    const closing = ui.extraTabs.find((tab) => tabKey(tab) === key);
    if (closing?.kind === 'terminal')
      void api.closeTerminal(terminalTabRef(workspace.id, closing.id));
    updateWorkspaceUi(workspace.id, (current) => ({
      extraTabs: current.extraTabs.filter((tab) => tabKey(tab) !== key),
    }));
  }
  if (ui.activeKey === key)
    updateWorkspaceUi(workspace.id, () => ({ activeKey: null }));
}

function openCreated(created: Result<Workspace[]>) {
  if (!reportFailure(created)) return false;
  selectWorkspace(created.value[0].id);
  return true;
}

export async function createWorkspaces(
  repoIds: string[],
  task: SendOptions | null,
  source?: WorkspaceSource,
  keepAfterMerge = false,
) {
  const created = await api.createWorkspaces(repoIds, task, source);
  if (created.ok && keepAfterMerge) {
    await Promise.all(
      created.value.map((workspace) =>
        api.setKeepAfterMerge(workspace.id, true),
      ),
    );
  }
  return openCreated(created);
}

export async function startFromAsk(ask: AskChat) {
  return openCreated(await api.startFromAsk(ask.id));
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

export async function fixErrors(workspace: Workspace, pr: PrStatus) {
  reportFailure(
    await api.fixChecks(workspace.id, activeSessionId(workspace), pr.number),
  );
}

export async function resolveConflicts(workspace: Workspace, pr: PrStatus) {
  reportFailure(
    await api.resolveConflicts(
      workspace.id,
      activeSessionId(workspace),
      pr.number,
    ),
  );
}

export async function openPrAsWorkspace(workspace: Workspace, pr: PrStatus) {
  const opened = await api.openPrAsWorkspace(workspace.id, pr.number);
  if (reportFailure(opened)) selectWorkspace(opened.value.id);
}

export async function mergePr(workspace: Workspace, pr: PrStatus) {
  const result = await api.mergePr(workspace.id, pr.number);
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
  const scriptId = getUi().workspaces[workspace.id]?.runScriptId ?? undefined;
  reportFailure(await api.startScript(workspace.id, 'run', scriptId));
}

export async function startRunScript(workspace: Workspace, scriptId: string) {
  updateWorkspaceUi(workspace.id, () => ({
    terminalTab: 'run',
    runScriptId: scriptId,
  }));
  setUi({ terminal: true, panel: true });
  reportFailure(await api.startScript(workspace.id, 'run', scriptId));
}

export function focusComposer() {
  document.querySelector<HTMLTextAreaElement>('[data-composer]')?.focus();
}
