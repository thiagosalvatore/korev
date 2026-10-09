import type {
  RemoteApi,
  RemoteMethod,
} from '../../korev-desktop/src/shared/api';
import {
  PLAN_TOOL,
  upsertChatItem,
  type AppState,
  type ChatItem,
  type ChatSession,
  type PermissionResponse,
  type Result,
  type Workspace,
  type WorkspaceRuntime,
} from '../../korev-desktop/src/shared/model';
import { apiFor, createEventListeners } from './bridge';
import type { Connection, ConnectionStatus } from './connection';
import {
  answerReply,
  createPrReply,
  DEMO_BASE_BRANCH,
  DEMO_DICTATION,
  DEMO_REPLY,
  DENIED_REPLY,
  demoPullRequest,
  demoRepoUrl,
  demoRuntime,
  demoSession,
  demoWorkspace,
  demoWorld,
  NEW_CHAT_TITLE,
  PLAN,
  PLAN_APPROVED_REPLY,
  PLAN_REPLY,
} from './demoContent';

const STREAM_STEP_MS = 80;
const THINKING_MS = 1500;
const OPENING_REPLY_DELAY_MS = 8000;
const WORDS_PER_STEP = 3;
const TITLE_MAX_CHARS = 32;
const FIRST_DEMO_PR_NUMBER = 100;
const BRANCH_WORDS = 4;
const ONLINE: ConnectionStatus = { state: 'online', attempting: false };
const STOPPED = 'Stopped.';
const NO_WORKSPACE = 'This chat has no workspace.';
const ALREADY_ANSWERED = 'This was already answered.';
const NO_OP = () => undefined;

function ok(): Result;
function ok<T>(value: T): Result<T>;
function ok<T>(value?: T): Result<T | undefined> {
  return { ok: true, value };
}

function failed(message: string): Result<never> {
  return { ok: false, message };
}

function titleFrom(text: string): string {
  const line = text.trim().split('\n')[0];
  return line.length > TITLE_MAX_CHARS
    ? `${line.slice(0, TITLE_MAX_CHARS - 1).trimEnd()}…`
    : line;
}

function branchFrom(text: string, fallback: string): string {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return words.slice(0, BRANCH_WORDS).join('-') || fallback;
}

function workspaceOf(
  state: AppState,
  sessionId: string,
): Workspace | undefined {
  return state.workspaces.find((workspace) =>
    workspace.sessions.some((session) => session.id === sessionId),
  );
}

function sessionOf(
  state: AppState,
  sessionId: string,
): ChatSession | undefined {
  return [
    ...state.workspaces.flatMap((workspace) => workspace.sessions),
    ...state.askChats.map((ask) => ask.session),
  ].find((session) => session.id === sessionId);
}

function withWorkspace(
  state: AppState,
  workspaceId: string,
  change: (workspace: Workspace) => Workspace,
): AppState {
  return {
    ...state,
    workspaces: state.workspaces.map((workspace) =>
      workspace.id === workspaceId ? change(workspace) : workspace,
    ),
  };
}

function withRuntime(
  state: AppState,
  workspaceId: string | undefined,
  change: (runtime: WorkspaceRuntime) => Partial<WorkspaceRuntime>,
): AppState {
  if (!workspaceId) return state;
  const runtime = state.runtime[workspaceId] ?? demoRuntime();
  return {
    ...state,
    runtime: {
      ...state.runtime,
      [workspaceId]: { ...runtime, ...change(runtime) },
    },
  };
}

function withSession(
  state: AppState,
  sessionId: string,
  change: (session: ChatSession) => ChatSession,
): AppState {
  const changeIfMatch = (session: ChatSession) =>
    session.id === sessionId ? change(session) : session;
  return {
    ...state,
    workspaces: state.workspaces.map((workspace) => ({
      ...workspace,
      sessions: workspace.sessions.map(changeIfMatch),
    })),
    askChats: state.askChats.map((ask) => ({
      ...ask,
      session: changeIfMatch(ask.session),
    })),
  };
}

function without(list: string[], id: string): string[] {
  return list.filter((entry) => entry !== id);
}

function withRunning(
  state: AppState,
  sessionId: string,
  running: boolean,
): AppState {
  const next = {
    ...state,
    runningSessions: running
      ? [...without(state.runningSessions, sessionId), sessionId]
      : without(state.runningSessions, sessionId),
    waitingSessions: without(state.waitingSessions, sessionId),
  };
  return withRuntime(next, workspaceOf(state, sessionId)?.id, () =>
    running ? { status: 'working' } : { status: 'idle', unread: true },
  );
}

function withWaiting(state: AppState, sessionId: string): AppState {
  const next = {
    ...state,
    runningSessions: without(state.runningSessions, sessionId),
    waitingSessions: [...without(state.waitingSessions, sessionId), sessionId],
  };
  return withRuntime(next, workspaceOf(state, sessionId)?.id, () => ({
    status: 'waiting',
  }));
}

function chosenAnswer(response: PermissionResponse): string {
  return Object.values(response.answers ?? {}).join(', ');
}

export function createDemoConnection(): Connection {
  const world = demoWorld(Date.now());
  let state = world.state;
  const transcripts = world.transcripts;
  const events = createEventListeners();
  const connectListeners = new Set<() => void>();
  const replies = new Map<string, ReturnType<typeof setTimeout>>();
  let lastId = 0;
  let nextPrNumber = FIRST_DEMO_PR_NUMBER;
  let started = false;

  const newId = (prefix: string) => `demo-${prefix}-${++lastId}`;
  const now = () => new Date().toISOString();

  function setState(next: AppState) {
    state = next;
    events.emit('state', state);
  }

  function addItem(sessionId: string, item: ChatItem) {
    transcripts.set(
      sessionId,
      upsertChatItem(transcripts.get(sessionId) ?? [], item),
    );
    events.emit('chat', { sessionId, item });
  }

  function cancelReply(sessionId: string) {
    clearTimeout(replies.get(sessionId));
    replies.delete(sessionId);
  }

  function finishReply(sessionId: string, startedAt: number, completed = true) {
    cancelReply(sessionId);
    addItem(sessionId, {
      id: newId('result'),
      kind: 'result',
      ok: completed,
      text: completed ? '' : STOPPED,
      durationMs: Date.now() - startedAt,
      costUsd: null,
    });
    setState(withRunning(state, sessionId, false));
  }

  function streamReply(
    sessionId: string,
    text: string,
    {
      delayMs = THINKING_MS,
      onDone = (startedAt: number) => finishReply(sessionId, startedAt),
    } = {},
  ) {
    cancelReply(sessionId);
    const id = newId('reply');
    const words = text.split(' ');
    const startedAt = Date.now();
    let shown = 0;
    const schedule = (ms: number) =>
      replies.set(sessionId, setTimeout(step, ms));
    function step() {
      shown = Math.min(words.length, shown + WORDS_PER_STEP);
      addItem(sessionId, {
        id,
        kind: 'assistant',
        text: words.slice(0, shown).join(' '),
      });
      if (shown < words.length) return schedule(STREAM_STEP_MS);
      replies.delete(sessionId);
      onDone(startedAt);
    }
    setState(withRunning(state, sessionId, true));
    schedule(delayMs);
  }

  function askToApprovePlan(sessionId: string) {
    addItem(sessionId, {
      id: newId('plan'),
      kind: 'permission',
      tool: PLAN_TOOL,
      summary: 'Approve the plan',
      detail: PLAN,
      questions: null,
      plan: PLAN,
      status: 'pending',
    });
    setState(withWaiting(state, sessionId));
  }

  function replyWithPlan(sessionId: string) {
    streamReply(sessionId, PLAN_REPLY, {
      onDone: () => askToApprovePlan(sessionId),
    });
  }

  function addSession(workspaceId: string, session: ChatSession) {
    setState(
      withWorkspace(state, workspaceId, (workspace) => ({
        ...workspace,
        sessions: [...workspace.sessions, session],
      })),
    );
  }

  function addPullRequest(
    workspace: Workspace,
    sessionId: string,
    number: number,
  ) {
    const repo = state.repos.find((entry) => entry.id === workspace.repoId);
    const pr = demoPullRequest(
      { name: repo?.name ?? workspace.repoId },
      number,
      workspace.name,
      workspace.branch,
      now(),
      { reviewDecision: null },
    );
    const withTrackedPr = withWorkspace(state, workspace.id, (entry) => ({
      ...entry,
      prs: [...entry.prs, { url: pr.url, sessionId }],
    }));
    setState(
      withRuntime(withTrackedPr, workspace.id, (runtime) => ({
        prs: [...runtime.prs, pr],
      })),
    );
  }

  function createWorkspace(repoId: string, text: string): Workspace {
    const repo = state.repos.find((entry) => entry.id === repoId);
    const id = newId('workspace');
    const branch = branchFrom(text, id);
    return demoWorkspace(
      id,
      { id: repoId, name: repo?.name ?? repoId },
      branch,
      text ? titleFrom(text) : branch,
      demoSession(newId('session'), NEW_CHAT_TITLE, now()),
    );
  }

  const api: RemoteApi = {
    async getState() {
      return state;
    },
    async transcript(sessionId) {
      return transcripts.get(sessionId) ?? [];
    },
    async send(sessionId, options) {
      addItem(sessionId, {
        id: newId('user'),
        kind: 'user',
        text: options.text,
        at: now(),
        checkpoint: null,
      });
      if (sessionOf(state, sessionId)?.title === NEW_CHAT_TITLE)
        setState(
          withSession(state, sessionId, (session) => ({
            ...session,
            title: titleFrom(options.text),
          })),
        );
      if (options.planMode) replyWithPlan(sessionId);
      else streamReply(sessionId, DEMO_REPLY);
      return ok();
    },
    async stop(sessionId) {
      if (state.runningSessions.includes(sessionId))
        finishReply(sessionId, Date.now(), false);
    },
    async respondPermission(sessionId, itemId, response) {
      const item = transcripts
        .get(sessionId)
        ?.find((entry) => entry.id === itemId);
      if (item?.kind !== 'permission' || item.status !== 'pending')
        return failed(ALREADY_ANSWERED);
      addItem(sessionId, {
        ...item,
        status: response.allow ? 'allowed' : 'denied',
      });
      if (item.plan && !response.allow && response.message)
        replyWithPlan(sessionId);
      else if (!response.allow) streamReply(sessionId, DENIED_REPLY);
      else if (item.plan) streamReply(sessionId, PLAN_APPROVED_REPLY);
      else streamReply(sessionId, answerReply(chosenAnswer(response)));
      return ok();
    },
    async approvePlan(sessionId) {
      streamReply(sessionId, PLAN_APPROVED_REPLY);
      return ok();
    },
    async handoffPlan(sessionId) {
      const workspace = workspaceOf(state, sessionId);
      if (!workspace) return failed(NO_WORKSPACE);
      const session = demoSession(newId('session'), NEW_CHAT_TITLE, now());
      addSession(workspace.id, session);
      streamReply(session.id, PLAN_APPROVED_REPLY);
      return ok(session.id);
    },
    async newSession(workspaceId, agent) {
      const session = demoSession(
        newId('session'),
        NEW_CHAT_TITLE,
        now(),
        agent,
      );
      addSession(workspaceId, session);
      return session;
    },
    async closeSession(workspaceId, sessionId) {
      setState(
        withWorkspace(state, workspaceId, (workspace) => ({
          ...workspace,
          sessions: workspace.sessions.filter(
            (session) => session.id !== sessionId,
          ),
        })),
      );
    },
    async updateSession(sessionId, patch) {
      setState(
        withSession(state, sessionId, (session) => ({
          ...session,
          ...patch,
          pendingPlan: undefined,
        })),
      );
    },
    async createWorkspaces(repoIds, task) {
      const created = repoIds.map((repoId) =>
        createWorkspace(repoId, task?.text ?? ''),
      );
      setState({
        ...state,
        workspaces: [...state.workspaces, ...created],
        runtime: {
          ...state.runtime,
          ...Object.fromEntries(
            created.map((workspace) => [workspace.id, demoRuntime()]),
          ),
        },
      });
      if (task)
        for (const workspace of created)
          await api.send(workspace.sessions[0].id, task);
      return ok(created);
    },
    async archiveWorkspace(workspaceId) {
      setState(
        withWorkspace(state, workspaceId, (workspace) => ({
          ...workspace,
          archivedAt: now(),
        })),
      );
      return ok();
    },
    async listBranches() {
      return [DEMO_BASE_BRANCH];
    },
    async listPullRequests() {
      return [];
    },
    async listIssues() {
      return [];
    },
    async slashCommands() {
      return [];
    },
    async changes() {
      return [];
    },
    async fileDiff() {
      return '';
    },
    async rangeChanges() {
      return [];
    },
    async listFiles() {
      return [];
    },
    async readFile() {
      return null;
    },
    async readImage() {
      return null;
    },
    async saveAttachment(_workspaceId, name) {
      return ok(name);
    },
    async prStatuses(workspaceId) {
      return state.runtime[workspaceId]?.prs ?? [];
    },
    async prThreads() {
      return [];
    },
    async createPr(workspaceId, sessionId) {
      const workspace = state.workspaces.find(
        (entry) => entry.id === workspaceId,
      );
      if (!workspace) return failed(NO_WORKSPACE);
      const number = nextPrNumber++;
      streamReply(sessionId, createPrReply(workspace.branch, number), {
        onDone: (startedAt) => {
          addPullRequest(workspace, sessionId, number);
          finishReply(sessionId, startedAt);
        },
      });
      return ok();
    },
    async fixChecks(_workspaceId, sessionId) {
      streamReply(sessionId, DEMO_REPLY);
      return ok();
    },
    async resolveConflicts(_workspaceId, sessionId) {
      streamReply(sessionId, DEMO_REPLY);
      return ok();
    },
    async mergePr(workspaceId, prNumber) {
      setState(
        withRuntime(state, workspaceId, (runtime) => ({
          prs: runtime.prs.map((pr) =>
            pr.number === prNumber
              ? { ...pr, state: 'MERGED' as const, mergedAt: now() }
              : pr,
          ),
        })),
      );
      return ok();
    },
    async repoIcon() {
      return null;
    },
    async repoGithubUrl(repoId) {
      const repo = state.repos.find((entry) => entry.id === repoId);
      return repo ? demoRepoUrl(repo) : null;
    },
    async createAskChat(repoIds) {
      const ask = {
        id: newId('ask'),
        repoIds,
        session: demoSession(newId('session'), NEW_CHAT_TITLE, now()),
        createdAt: now(),
        lastMessageAt: now(),
      };
      setState({ ...state, askChats: [...state.askChats, ask] });
      return ask;
    },
    async deleteAskChat(askChatId) {
      setState({
        ...state,
        askChats: state.askChats.filter((ask) => ask.id !== askChatId),
      });
    },
    async registerPushToken() {},
    async unregisterPushToken() {},
    async prepareDictation() {},
    async transcribe() {
      return DEMO_DICTATION;
    },
  };

  const bridge = {
    async call(method: string, args: unknown[]) {
      const handler = api[method as RemoteMethod] as
        | ((...handlerArgs: unknown[]) => Promise<unknown>)
        | undefined;
      if (!handler) throw new Error(`The demo cannot ${method}.`);
      return handler(...args);
    },
    on: events.on,
  };

  return {
    ...bridge,
    api: apiFor(bridge),
    onConnect(listener) {
      connectListeners.add(listener);
      return () => connectListeners.delete(listener);
    },
    status: () => ONLINE,
    onStatus: () => NO_OP,
    open() {
      connectListeners.forEach((listener) => listener());
      if (started) return;
      started = true;
      for (const reply of world.replies)
        streamReply(reply.sessionId, reply.text, {
          delayMs: OPENING_REPLY_DELAY_MS,
        });
    },
    close() {
      replies.forEach((timer) => clearTimeout(timer));
      replies.clear();
    },
  };
}
