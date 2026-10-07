import {
  hasWorktree,
  type AskChat,
  type ChatItem,
  type ChatSession,
  type Checkpoint,
  type PermissionResponse,
  type PlanLimit,
  type Repo,
  type Result,
  type SendOptions,
  type Workspace,
} from '../shared/model';
import {
  allowResponse,
  controlResponse,
  denyResponse,
  parseControlRequest,
  parseJsonLine,
  permissionItem,
  PLAN_TOOL,
  type ControlRequest,
  type TurnParser,
} from './agent-events';
import { spawnAgent, type AgentProcess } from './agent-process';
import {
  AGENTS,
  backgroundTaskCount,
  claudeUserMessage,
  codexPrompt,
  isUserMessageAck,
  type TurnRequest,
} from './agents';
import { prepareAskWorktree } from './ask-worktrees';
import { errorMessage, NotFoundError, type Context } from './context';
import {
  branchExists,
  createCheckpoint,
  hasUpstream,
  renameBranch,
  restoreCheckpoint,
} from './git';
import { rangeFiles } from './git-review';
import { findPrUrls } from './pull-requests';
import { withPrompt } from './repo-config';
import { isUntitledName } from './workspace-setup';
import {
  isUntitled,
  refreshStats,
  renameBranchPrompt,
  scriptEnv,
  suggestName,
  suggestTitle,
  switchAgent,
  workspaceConfig,
} from './workspaces';

const TITLE_MAX_CHARS = 32;
const SAVE_EVERY_ITEMS = 20;
const STDERR_TAIL_CHARS = 2_000;
const REPLAY_ITEM_CHARS = 2_000;
const REPLAY_TOTAL_CHARS = 24_000;
const DENIED_MESSAGE = 'The user denied this request.';
const ASK_PLAN_MESSAGE =
  'This is a read-only Ask chat, so the plan cannot be carried out here. The user sees your plan in the chat and can start workspaces from it. Finish your reply.';
const STATUSES_KEPT_BY_TURNS = new Set([
  'creating',
  'failed',
  'setting-up',
  'error',
]);

export function replayPrompt(history: ChatItem[], text: string): string {
  const lines = history.flatMap((item) => {
    if (item.kind === 'user')
      return [`User: ${item.text.slice(0, REPLAY_ITEM_CHARS)}`];
    if (item.kind === 'assistant')
      return [`Assistant: ${item.text.slice(0, REPLAY_ITEM_CHARS)}`];
    return [];
  });
  if (!lines.length) return text;
  const transcript = lines.join('\n\n').slice(-REPLAY_TOTAL_CHARS);
  return `<previous-conversation>\nHere is the conversation so far, for context:\n\n${transcript}\n</previous-conversation>\n\n${text}`;
}

export interface LinkedWorkspace {
  repo: Repo;
  workspace: Workspace;
}

function linkedLines(linked: LinkedWorkspace[]): string[] {
  if (!linked.length) return [];
  return [
    `This workspace is linked with workspaces in other repositories that work on the same task:`,
    ...linked.map(
      ({ repo, workspace }) =>
        `- ${repo.name}: ${workspace.path} (branch ${workspace.branch})`,
    ),
    `You can read their files to keep every side consistent. Do not edit them: each has its own agent. Use their .context directories to leave notes for the other agents.`,
  ];
}

export function latestPlan(items: ChatItem[]): string | null {
  const reply = items.slice(
    items.findLastIndex((item) => item.kind === 'user') + 1,
  );
  const planTool = reply.findLast(
    (item) => item.kind === 'tool' && item.name === PLAN_TOOL,
  );
  if (planTool?.kind === 'tool' && planTool.detail) return planTool.detail;
  const text = reply
    .flatMap((item) => (item.kind === 'assistant' ? [item.text] : []))
    .join('\n\n')
    .trim();
  return text || null;
}

export function systemPrompt(
  repo: Repo,
  workspace: Workspace,
  linked: LinkedWorkspace[] = [],
  general?: string,
): string {
  const base = [
    `You are working inside Korev, a Mac app that lets the user run many coding agents in parallel.`,
    `Your work should take place in the ${workspace.path} directory (unless otherwise directed), which has been set up for you to work in.`,
    `It is a git worktree of ${repo.name} on branch ${workspace.branch}. The target branch for this workspace is origin/${workspace.baseBranch}. Use this for actions like diffing (\`git diff origin/${workspace.baseBranch}...\`) or creating PRs (\`gh pr create --base ${workspace.baseBranch}\`).`,
    `The workspace has a .context directory (gitignored) where you can save files to collaborate with other agents.`,
    `Do not rename the current branch unless the user explicitly tells you to do so.`,
    `If the work needs more than one PR, create the extra branches in this worktree (for example as a stack). Do not create new git worktrees.`,
    `If you start a dev server, use port $KOREV_PORT (ports $KOREV_PORT to $KOREV_PORT+9 are reserved for this workspace).`,
    ...linkedLines(linked),
  ].join('\n');
  return withPrompt(base, general);
}

type ResultItem = Extract<ChatItem, { kind: 'result' }>;

function mergeLimits(current: PlanLimit[], next: PlanLimit[]): PlanLimit[] {
  const byLabel = new Map(
    [...current, ...next].map((limit) => [limit.label, limit]),
  );
  return [...byLabel.values()];
}

export function askSystemPrompt(repos: Repo[], checkouts: string[]): string {
  return [
    `You are answering questions inside Korev, a Mac app that lets the user run many coding agents in parallel.`,
    `The user is asking about these repositories. Each one is checked out read-only at its latest default branch:`,
    ...repos.map(
      (repo, index) =>
        `- ${repo.name}: ${checkouts[index]} (origin/${repo.defaultBranch})`,
    ),
    `Read the code to answer. Do not edit files, create branches or commit. When the user asks for a plan, write the whole plan in your reply.`,
    `You may run commands that act outside these checkouts, like posting a pull request review with gh. The user approves each one.`,
  ].join('\n');
}

function titleFrom(text: string): string {
  const line = text.trim().split('\n')[0];
  return line.length > TITLE_MAX_CHARS
    ? `${line.slice(0, TITLE_MAX_CHARS - 1).trimEnd()}…`
    : line;
}

interface TurnTarget {
  cwd: string;
  env: NodeJS.ProcessEnv;
  systemPrompt: string;
  readOnly: boolean;
  addDirs: string[];
}

type Owner =
  | { kind: 'workspace'; workspace: Workspace }
  | { kind: 'ask'; ask: AskChat };

interface ActiveTurn {
  id: string;
  owner: Owner;
  process: AgentProcess | null;
  stopRequested: boolean;
  written: number;
  acknowledged: number;
  backgroundTasks: number;
  permissions: Map<string, ControlRequest>;
  start: Checkpoint | null;
  startedAt: string;
}

export interface TurnPrLinks {
  sessionId: string;
  startedAt: string;
  urls: string[];
}

function turnPrUrls(items: ChatItem[], turn: ActiveTurn): string[] {
  return [
    ...new Set(
      items.flatMap((item) =>
        item.kind === 'tool' && item.output && item.id.startsWith(`${turn.id}:`)
          ? findPrUrls(item.output)
          : [],
      ),
    ),
  ];
}

function turnResult(items: ChatItem[], turn: ActiveTurn): ResultItem | null {
  const result = items.findLast(
    (item) => item.kind === 'result' && item.id.startsWith(`${turn.id}:`),
  );
  return result?.kind === 'result' ? result : null;
}

export interface Chats {
  transcript(sessionId: string): Promise<ChatItem[]>;
  isRunning(sessionId: string): boolean;
  send(sessionId: string, options: SendOptions): Promise<Result>;
  seed(sessionId: string, history: ChatItem[]): Promise<void>;
  stop(sessionId: string): void;
  stopWorkspace(workspace: Workspace): void;
  respondPermission(
    sessionId: string,
    itemId: string,
    response: PermissionResponse,
  ): Result;
  revert(sessionId: string, itemId: string): Promise<Result<string>>;
  forget(sessionId: string): Promise<void>;
  settled(): Promise<void>;
}

export function createChats(
  ctx: Context,
  onWorkspaceTurnFinished: (workspaceId: string, links: TurnPrLinks) => void,
): Chats {
  const transcripts = new Map<string, ChatItem[]>();
  const turns = new Map<string, ActiveTurn>();
  const running = new Set<Promise<void>>();

  function locate(sessionId: string): { owner: Owner; session: ChatSession } {
    for (const workspace of ctx.store.state.workspaces) {
      const session = workspace.sessions.find(
        (entry) => entry.id === sessionId,
      );
      if (session) return { owner: { kind: 'workspace', workspace }, session };
    }
    const ask = ctx.store.state.askChats.find(
      (entry) => entry.session.id === sessionId,
    );
    if (ask) return { owner: { kind: 'ask', ask }, session: ask.session };
    throw new NotFoundError('Session', sessionId);
  }

  async function transcript(sessionId: string): Promise<ChatItem[]> {
    const cached = transcripts.get(sessionId);
    if (cached) return cached;
    const items = await ctx.store.loadTranscript(sessionId);
    const loadedMeanwhile = transcripts.get(sessionId);
    if (loadedMeanwhile) return loadedMeanwhile;
    transcripts.set(sessionId, items);
    return items;
  }

  function upsert(sessionId: string, items: ChatItem[], item: ChatItem) {
    const index = items.findIndex((entry) => entry.id === item.id);
    if (index === -1) items.push(item);
    else items[index] = item;
    ctx.deps.emit('chat', { sessionId, item });
  }

  function persist(sessionId: string, items: ChatItem[]) {
    void ctx.store.saveTranscript(sessionId, items).catch(() => undefined);
  }

  function refreshStatus(owner: Owner) {
    if (owner.kind !== 'workspace') return;
    const { workspace } = owner;
    const runtime = ctx.runtime(workspace.id);
    if (STATUSES_KEPT_BY_TURNS.has(runtime.status)) return;
    const sessions = workspace.sessions.map((entry) => entry.id);
    const waiting = sessions.some(
      (id) => (turns.get(id)?.permissions.size ?? 0) > 0,
    );
    const working = sessions.some((id) => ctx.runningSessions.has(id));
    if (waiting) ctx.setStatus(workspace.id, 'waiting');
    else if (working) ctx.setStatus(workspace.id, 'working');
    else ctx.setStatus(workspace.id, 'idle');
  }

  function isWatching(workspace: Workspace) {
    return (
      ctx.deps.isWindowFocused() && ctx.focusedWorkspaceId === workspace.id
    );
  }

  function alertUser(owner: Owner, title: string, body: string) {
    if (owner.kind !== 'workspace') return;
    const { workspace } = owner;
    if (!isWatching(workspace) && ctx.store.state.settings.notificationSound)
      ctx.deps.playSound();
    if (!ctx.deps.isWindowFocused())
      ctx.deps.notify({ title, body, workspaceId: workspace.id });
  }

  function expirePermissions(
    sessionId: string,
    items: ChatItem[],
    turn: ActiveTurn,
  ) {
    for (const itemId of turn.permissions.keys()) {
      const item = items.find((entry) => entry.id === itemId);
      if (item?.kind === 'permission' && item.status === 'pending') {
        upsert(sessionId, items, { ...item, status: 'expired' });
      }
    }
    turn.permissions.clear();
  }

  function finishWorkspaceTurn(
    workspace: Workspace,
    session: ChatSession,
    items: ChatItem[],
    turn: ActiveTurn,
  ) {
    const runtime = ctx.runtime(workspace.id);
    if (!isWatching(workspace)) runtime.unread = true;
    void refreshStats(ctx, workspace);
    onWorkspaceTurnFinished(workspace.id, {
      sessionId: session.id,
      startedAt: turn.startedAt,
      urls: turnPrUrls(items, turn),
    });
    const last = items.findLast((item) => item.kind === 'result');
    alertUser(
      { kind: 'workspace', workspace },
      `${workspace.name} finished`,
      last?.kind === 'result' && !last.ok ? last.text : session.title,
    );
  }

  function touch(owner: Owner) {
    if (owner.kind !== 'ask') return;
    owner.ask.lastMessageAt = ctx.deps.now().toISOString();
  }

  function finishTurn(
    owner: Owner,
    session: ChatSession,
    items: ChatItem[],
    turn: ActiveTurn,
  ) {
    ctx.runningSessions.delete(session.id);
    persist(session.id, items);
    refreshStatus(owner);
    touch(owner);
    if (owner.kind === 'workspace')
      finishWorkspaceTurn(owner.workspace, session, items, turn);
    ctx.store.save();
    ctx.emitState();
  }

  function askWorktreeInUse(repoId: string, ask: AskChat) {
    return ctx.store.state.askChats.some(
      (other) =>
        other !== ask &&
        other.repoIds.includes(repoId) &&
        turns.has(other.session.id),
    );
  }

  async function askTarget(ask: AskChat): Promise<TurnTarget> {
    const root = ctx.store.state.settings.workspacesRoot;
    const repos = ask.repoIds.map((repoId) => ctx.repo(repoId));
    const checkouts = await Promise.all(
      repos.map((repo) =>
        prepareAskWorktree(ctx.git, root, repo, askWorktreeInUse(repo.id, ask)),
      ),
    );
    return {
      cwd: checkouts[0],
      env: ctx.deps.env,
      systemPrompt: askSystemPrompt(repos, checkouts),
      readOnly: true,
      addDirs: checkouts.slice(1),
    };
  }

  function linkedWorkspaces(workspace: Workspace): LinkedWorkspace[] {
    if (!workspace.groupId) return [];
    return ctx.store.state.workspaces
      .filter(
        (other) =>
          other !== workspace &&
          other.groupId === workspace.groupId &&
          !other.archivedAt &&
          hasWorktree(ctx.runtime(other.id)),
      )
      .map((other) => ({ repo: ctx.repo(other.repoId), workspace: other }));
  }

  async function turnTarget(owner: Owner): Promise<TurnTarget> {
    if (owner.kind === 'ask') return askTarget(owner.ask);
    const { workspace } = owner;
    const repo = ctx.repo(workspace.repoId);
    const linked = linkedWorkspaces(workspace);
    const config = await workspaceConfig(ctx, workspace);
    return {
      cwd: workspace.path,
      env: await scriptEnv(ctx, repo, workspace),
      systemPrompt: systemPrompt(
        repo,
        workspace,
        linked,
        config.prompts.general,
      ),
      readOnly: false,
      addDirs: linked.map((entry) => entry.workspace.path),
    };
  }

  function answerControl(
    turn: ActiveTurn,
    request: ControlRequest,
    body: Record<string, unknown>,
  ) {
    turn.process?.write(controlResponse(request.requestId, body));
  }

  function onControlRequest(
    session: ChatSession,
    items: ChatItem[],
    turn: ActiveTurn,
    request: ControlRequest,
    cwd: string,
  ) {
    if (turn.owner.kind === 'ask' && request.tool === PLAN_TOOL) {
      answerControl(turn, request, denyResponse(ASK_PLAN_MESSAGE));
      return;
    }
    if (
      !request.needsUser &&
      !ctx.store.state.settings.toolApprovals &&
      turn.owner.kind !== 'ask'
    ) {
      answerControl(turn, request, allowResponse(request));
      return;
    }
    const itemId = `${turn.id}:permission:${request.requestId}`;
    turn.permissions.set(itemId, request);
    upsert(session.id, items, permissionItem(itemId, request, cwd));
    refreshStatus(turn.owner);
    ctx.emitState();
    const name =
      turn.owner.kind === 'workspace' ? turn.owner.workspace.name : 'Ask';
    alertUser(turn.owner, `${name} needs your input`, session.title);
  }

  function handleLine(
    session: ChatSession,
    items: ChatItem[],
    turn: ActiveTurn,
    parser: TurnParser,
    cwd: string,
    line: string,
  ): number {
    const event = parseJsonLine(line);
    if (!event) return 0;
    const request = parseControlRequest(event);
    if (request) {
      onControlRequest(session, items, turn, request, cwd);
      return 1;
    }
    if (isUserMessageAck(event)) turn.acknowledged += 1;
    turn.backgroundTasks = backgroundTaskCount(event) ?? turn.backgroundTasks;
    const updates = parser.feed(event);
    for (const item of updates)
      upsert(session.id, items, { ...item, id: `${turn.id}:${item.id}` });
    const allConsumed =
      turn.acknowledged >= turn.written || turn.acknowledged === 0;
    if (event.type === 'result' && allConsumed && turn.backgroundTasks === 0)
      turn.process?.closeInput();
    return updates.length;
  }

  async function runTurn(
    session: ChatSession,
    options: SendOptions,
    items: ChatItem[],
    turn: ActiveTurn,
  ) {
    const agent = AGENTS[session.agent];
    const prompt = session.agentSessionId
      ? options.text
      : replayPrompt(items.slice(0, -1), options.text);
    let sinceSave = 0;
    let parser: TurnParser | null = null;
    const notice = (text: string) =>
      upsert(session.id, items, {
        id: `${turn.id}:notice`,
        kind: 'notice',
        text,
      });
    try {
      const target = await turnTarget(turn.owner);
      const turnParser = agent.parser(target.cwd);
      parser = turnParser;
      const request: TurnRequest = {
        model: options.model,
        planMode: options.planMode && !target.readOnly,
        readOnly: target.readOnly,
        effort: options.effort,
        fast: options.fast,
        toolApprovals: ctx.store.state.settings.toolApprovals,
        resumeId: session.agentSessionId,
        fork: session.forkOnNextTurn,
        newSessionId: ctx.deps.newId(),
        systemPrompt: target.systemPrompt,
        addDirs: target.addDirs,
      };
      const process = spawnAgent(agent.binary, agent.args(request), {
        cwd: target.cwd,
        env: { ...target.env, KOREV_SESSION_ID: session.id },
        onLine: (line) => {
          sinceSave += handleLine(
            session,
            items,
            turn,
            turnParser,
            target.cwd,
            line,
          );
          if (sinceSave < SAVE_EVERY_ITEMS) return;
          sinceSave = 0;
          persist(session.id, items);
        },
      });
      turn.process = process;
      if (turn.stopRequested) process.stop();
      if (agent.input === 'stream-json') {
        process.write(claudeUserMessage(prompt));
        turn.written = 1;
      } else {
        process.write(codexPrompt(request, prompt));
        process.closeInput();
      }
      const exit = await process.done;
      if (exit.stopped) notice('Stopped');
      else if (exit.exitCode !== 0 && !turnResult(items, turn)) {
        notice(
          exit.stderr.trim().slice(-STDERR_TAIL_CHARS) ||
            `${agent.binary} exited with code ${exit.exitCode}`,
        );
      }
    } catch (error) {
      notice(errorMessage(error));
    } finally {
      const startedSession = parser?.sessionId() ?? null;
      if (startedSession) {
        session.agentSessionId = startedSession;
        session.forkOnNextTurn = false;
      }
      expirePermissions(session.id, items, turn);
      if (parser) await recordUsage(session, items, turn, parser);
      await recordTurnChanges(session.id, items, turn);
      turns.delete(session.id);
      finishTurn(turn.owner, session, items, turn);
      void sendQueued(session.id, options);
    }
  }

  async function sendQueued(sessionId: string, options: SendOptions) {
    const items = await transcript(sessionId);
    const queued = items.flatMap((item) =>
      item.kind === 'user' && item.queued ? [item] : [],
    );
    if (!queued.length || turns.has(sessionId)) return;
    const { owner } = locate(sessionId);
    const start =
      owner.kind === 'workspace'
        ? await createCheckpoint(ctx.git, owner.workspace.path).catch(
            () => null,
          )
        : null;
    if (turns.has(sessionId)) return;
    for (const item of queued)
      upsert(sessionId, items, { ...item, queued: false });
    const text = queued.map((item) => item.text).join('\n\n');
    startTurn(sessionId, items, { ...options, text }, start);
  }

  async function recordUsage(
    session: ChatSession,
    items: ChatItem[],
    turn: ActiveTurn,
    parser: TurnParser,
  ) {
    const usage = await AGENTS[session.agent]
      .usage(parser, ctx.deps.env)
      .catch(() => null);
    if (!usage) return;
    const result = turnResult(items, turn);
    if (result && usage.context)
      upsert(session.id, items, { ...result, context: usage.context });
    ctx.planLimits[session.agent] = mergeLimits(
      ctx.planLimits[session.agent] ?? [],
      usage.limits,
    );
  }

  async function recordTurnChanges(
    sessionId: string,
    items: ChatItem[],
    turn: ActiveTurn,
  ) {
    if (turn.owner.kind !== 'workspace' || !turn.start) return;
    const { workspace } = turn.owner;
    const result = turnResult(items, turn);
    if (!result) return;
    try {
      const end = await createCheckpoint(ctx.git, workspace.path);
      if (!end) return;
      const range = { from: turn.start.snapshot, to: end.snapshot };
      const files = await rangeFiles(ctx.git, workspace.path, range);
      if (files.length)
        upsert(sessionId, items, { ...result, turn: { range, files } });
    } catch {
      return;
    }
  }

  function startTurn(
    sessionId: string,
    items: ChatItem[],
    options: SendOptions,
    start: Checkpoint | null,
  ) {
    const { owner, session } = locate(sessionId);
    const turn: ActiveTurn = {
      id: ctx.deps.newId().slice(0, 8),
      owner,
      process: null,
      stopRequested: false,
      written: 0,
      acknowledged: 0,
      backgroundTasks: 0,
      permissions: new Map(),
      start,
      startedAt: ctx.deps.now().toISOString(),
    };
    turns.set(sessionId, turn);
    ctx.runningSessions.add(sessionId);
    refreshStatus(owner);
    ctx.store.save();
    ctx.emitState();
    const done = runTurn(session, options, items, turn);
    running.add(done);
    void done.finally(() => running.delete(done));
  }

  function steer(
    sessionId: string,
    items: ChatItem[],
    turn: ActiveTurn,
    text: string,
  ): boolean {
    const { session } = locate(sessionId);
    const process = turn.process;
    if (AGENTS[session.agent].input !== 'stream-json' || !process?.inputOpen())
      return false;
    process.write(claudeUserMessage(text));
    turn.written += 1;
    upsert(sessionId, items, {
      id: ctx.deps.newId(),
      kind: 'user',
      text,
      at: ctx.deps.now().toISOString(),
      checkpoint: null,
    });
    return true;
  }

  function queue(sessionId: string, items: ChatItem[], text: string) {
    upsert(sessionId, items, {
      id: ctx.deps.newId(),
      kind: 'user',
      text,
      at: ctx.deps.now().toISOString(),
      checkpoint: null,
      queued: true,
    });
  }

  async function send(
    sessionId: string,
    options: SendOptions,
  ): Promise<Result> {
    const { owner, session } = locate(sessionId);
    const workspace = owner.kind === 'workspace' ? owner.workspace : null;
    if (workspace?.archivedAt)
      return { ok: false, message: 'Workspace is archived' };
    const items = await transcript(sessionId);
    const active = turns.get(sessionId);
    if (active) {
      if (!steer(sessionId, items, active, options.text))
        queue(sessionId, items, options.text);
      return { ok: true, value: undefined };
    }
    const firstMessage = !items.some((item) => item.kind === 'user');
    const checkpoint = workspace
      ? await createCheckpoint(ctx.git, workspace.path).catch(() => null)
      : null;
    upsert(sessionId, items, {
      id: ctx.deps.newId(),
      kind: 'user',
      text: options.text,
      at: ctx.deps.now().toISOString(),
      checkpoint,
    });
    touch(owner);
    if (isUntitled(session)) session.title = titleFrom(options.text);
    switchAgent(session, options.agent);
    session.model = options.model;
    session.effort = options.effort;
    session.fast = options.fast;
    session.planMode = options.planMode;
    startTurn(sessionId, items, options, checkpoint);
    if (workspace && firstMessage && session === workspace.sessions[0]) {
      void autoRenameBranch(workspace, options.text);
    }
    if (owner.kind === 'ask' && firstMessage) {
      void autoTitle(session, options.text);
    }
    return { ok: true, value: undefined };
  }

  function isPlaceholderBranch(workspace: Workspace) {
    return (
      isUntitledName(workspace.name) &&
      workspace.branch.split('/').at(-1) === workspace.name
    );
  }

  async function autoRenameBranch(workspace: Workspace, text: string) {
    if (
      !ctx.store.state.settings.autoRenameBranches ||
      !isPlaceholderBranch(workspace)
    )
      return;
    try {
      const repo = ctx.repo(workspace.repoId);
      const suggestion = await suggestName(
        ctx,
        text,
        await renameBranchPrompt(repo),
      );
      if (!suggestion || !isPlaceholderBranch(workspace)) return;
      if (await hasUpstream(ctx.git, workspace.path)) return;
      const prefix = workspace.branch.split('/').slice(0, -1).join('/');
      const next = prefix ? `${prefix}/${suggestion}` : suggestion;
      if (await branchExists(ctx.git, repo.path, next)) return;
      await renameBranch(ctx.git, workspace.path, workspace.branch, next);
      workspace.branch = next;
      ctx.store.save();
      ctx.emitState();
    } catch {
      return;
    }
  }

  async function autoTitle(session: ChatSession, text: string) {
    const placeholder = session.title;
    const suggestion = await suggestTitle(ctx, text);
    if (!suggestion || session.title !== placeholder) return;
    session.title = titleFrom(suggestion);
    ctx.store.save();
    ctx.emitState();
  }

  function stop(sessionId: string) {
    const turn = turns.get(sessionId);
    if (!turn) return;
    turn.stopRequested = true;
    turn.process?.stop();
  }

  function nextModeAfterPlan(): string {
    return ctx.store.state.settings.toolApprovals
      ? 'default'
      : 'bypassPermissions';
  }

  function respondPermission(
    sessionId: string,
    itemId: string,
    response: PermissionResponse,
  ): Result {
    const turn = turns.get(sessionId);
    const request = turn?.permissions.get(itemId);
    const items = transcripts.get(sessionId);
    const item = items?.find((entry) => entry.id === itemId);
    if (!turn?.process || !request || !items || item?.kind !== 'permission') {
      return {
        ok: false,
        message: 'This request is no longer waiting for an answer',
      };
    }
    const body = response.allow
      ? allowResponse(request, response.answers, nextModeAfterPlan())
      : denyResponse(response.message?.trim() || DENIED_MESSAGE);
    answerControl(turn, request, body);
    turn.permissions.delete(itemId);
    if (response.allow && request.tool === PLAN_TOOL) {
      locate(sessionId).session.planMode = false;
      ctx.store.save();
    }
    upsert(sessionId, items, {
      ...item,
      status: response.allow ? 'allowed' : 'denied',
    });
    refreshStatus(turn.owner);
    ctx.emitState();
    return { ok: true, value: undefined };
  }

  async function restoreFiles(
    owner: Owner,
    checkpoint: Checkpoint | null,
  ): Promise<string | null> {
    if (owner.kind === 'ask') return null;
    if (!checkpoint) return 'No checkpoint for this message';
    try {
      await restoreCheckpoint(ctx.git, owner.workspace.path, checkpoint);
      return null;
    } catch (error) {
      return errorMessage(error);
    }
  }

  async function revert(
    sessionId: string,
    itemId: string,
  ): Promise<Result<string>> {
    const { owner, session } = locate(sessionId);
    if (turns.has(sessionId))
      return { ok: false, message: 'Stop the agent first' };
    const items = await transcript(sessionId);
    const target = items.find((item) => item.id === itemId);
    if (target?.kind !== 'user')
      return { ok: false, message: 'Message not found' };
    const problem = await restoreFiles(owner, target.checkpoint);
    if (problem) return { ok: false, message: problem };
    items.splice(items.indexOf(target));
    session.agentSessionId = null;
    persist(sessionId, items);
    ctx.store.save();
    ctx.emitState();
    if (owner.kind === 'workspace') void refreshStats(ctx, owner.workspace);
    return { ok: true, value: target.text };
  }

  async function seed(sessionId: string, history: ChatItem[]) {
    const items = await transcript(sessionId);
    for (const item of history) upsert(sessionId, items, item);
    persist(sessionId, items);
  }

  return {
    transcript,
    isRunning: (sessionId) => turns.has(sessionId),
    send,
    seed,
    stop,
    stopWorkspace: (workspace) =>
      workspace.sessions.forEach((session) => stop(session.id)),
    respondPermission,
    revert,
    async settled() {
      while (running.size) await Promise.allSettled(running);
    },
    async forget(sessionId) {
      stop(sessionId);
      transcripts.delete(sessionId);
      await ctx.store.removeTranscript(sessionId);
    },
  };
}
