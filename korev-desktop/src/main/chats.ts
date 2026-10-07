import {
  hasWorktree,
  type AskChat,
  type ChatItem,
  type ChatSession,
  type Checkpoint,
  type Repo,
  type Result,
  type SendOptions,
  type Workspace,
} from '../shared/model';
import { AGENTS, codexPrompt, type TurnRequest } from './agents';
import { parseJsonLine, PLAN_TOOL, type TurnParser } from './agent-events';
import { prepareAskWorktree } from './ask-worktrees';
import { CommandAbortedError } from './command-runner';
import { errorMessage, NotFoundError, type Context } from './context';
import {
  branchExists,
  createCheckpoint,
  hasUpstream,
  renameBranch,
  restoreCheckpoint,
} from './git';
import { isUntitledName } from './workspace-setup';
import { isUntitled, refreshStats, scriptEnv, suggestName } from './workspaces';

const TURN_TIMEOUT_MS = 12 * 60 * 60_000;
const TITLE_MAX_CHARS = 32;
const SAVE_EVERY_ITEMS = 20;
const STDERR_TAIL_CHARS = 2_000;
const REPLAY_ITEM_CHARS = 2_000;
const REPLAY_TOTAL_CHARS = 24_000;

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
  return `<previous-conversation>\nThis chat was reset to an earlier point. Here is the conversation so far, for context:\n\n${transcript}\n</previous-conversation>\n\n${text}`;
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
): string {
  return [
    `You are working inside Korev, a Mac app that lets the user run many coding agents in parallel.`,
    `Your work should take place in the ${workspace.path} directory (unless otherwise directed), which has been set up for you to work in.`,
    `It is a git worktree of ${repo.name} on branch ${workspace.branch}. The target branch for this workspace is origin/${workspace.baseBranch}. Use this for actions like diffing (\`git diff origin/${workspace.baseBranch}...\`) or creating PRs (\`gh pr create --base ${workspace.baseBranch}\`).`,
    `The workspace has a .context directory (gitignored) where you can save files to collaborate with other agents.`,
    `Do not rename the current branch unless the user explicitly tells you to do so.`,
    `If you start a dev server, use port $CONDUCTOR_PORT (ports $CONDUCTOR_PORT to $CONDUCTOR_PORT+9 are reserved for this workspace).`,
    ...linkedLines(linked),
  ].join('\n');
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

export interface Chats {
  transcript(sessionId: string): Promise<ChatItem[]>;
  isRunning(sessionId: string): boolean;
  send(sessionId: string, options: SendOptions): Promise<Result>;
  stop(sessionId: string): void;
  stopWorkspace(workspace: Workspace): void;
  revert(sessionId: string, itemId: string): Promise<Result<string>>;
  forget(sessionId: string): Promise<void>;
}

export function createChats(ctx: Context): Chats {
  const transcripts = new Map<string, ChatItem[]>();
  const controllers = new Map<string, AbortController>();

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

  function finishWorkspaceTurn(
    workspace: Workspace,
    session: ChatSession,
    items: ChatItem[],
  ) {
    const stillWorking = workspace.sessions.some((entry) =>
      ctx.runningSessions.has(entry.id),
    );
    const runtime = ctx.runtime(workspace.id);
    if (!stillWorking && runtime.status === 'working')
      ctx.setStatus(workspace.id, 'idle');
    const watching =
      ctx.deps.isWindowFocused() && ctx.focusedWorkspaceId === workspace.id;
    if (!watching) runtime.unread = true;
    void refreshStats(ctx, workspace);
    if (!ctx.deps.isWindowFocused()) {
      const last = items.findLast((item) => item.kind === 'result');
      ctx.deps.notify({
        title: `${workspace.name} finished`,
        body: last?.kind === 'result' && !last.ok ? last.text : session.title,
        workspaceId: workspace.id,
      });
    }
  }

  function finishTurn(owner: Owner, session: ChatSession, items: ChatItem[]) {
    controllers.delete(session.id);
    ctx.runningSessions.delete(session.id);
    persist(session.id, items);
    if (owner.kind === 'workspace')
      finishWorkspaceTurn(owner.workspace, session, items);
    ctx.store.save();
    ctx.emitState();
  }

  function askWorktreeInUse(repoId: string, ask: AskChat) {
    return ctx.store.state.askChats.some(
      (other) =>
        other !== ask &&
        other.repoIds.includes(repoId) &&
        controllers.has(other.session.id),
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
    return {
      cwd: workspace.path,
      env: scriptEnv(ctx, repo, workspace),
      systemPrompt: systemPrompt(repo, workspace, linked),
      readOnly: false,
      addDirs: linked.map((entry) => entry.workspace.path),
    };
  }

  async function runTurn(
    owner: Owner,
    session: ChatSession,
    options: SendOptions,
    items: ChatItem[],
    signal: AbortSignal,
  ) {
    const agent = AGENTS[session.agent];
    const prompt = session.agentSessionId
      ? options.text
      : replayPrompt(items.slice(0, -1), options.text);
    const turnId = ctx.deps.newId().slice(0, 8);
    let sinceSave = 0;
    let parser: TurnParser | null = null;
    const notice = (text: string) =>
      upsert(session.id, items, {
        id: `${turnId}:notice`,
        kind: 'notice',
        text,
      });
    try {
      const target = await turnTarget(owner);
      const turnParser = agent.parser(target.cwd);
      parser = turnParser;
      const request: TurnRequest = {
        model: options.model,
        planMode: options.planMode || target.readOnly,
        effort: options.effort,
        resumeId: session.agentSessionId,
        newSessionId: ctx.deps.newId(),
        systemPrompt: target.systemPrompt,
        addDirs: target.addDirs,
      };
      const result = await ctx.deps.run(agent.binary, agent.args(request), {
        cwd: target.cwd,
        env: target.env,
        stdin:
          session.agent === 'codex' ? codexPrompt(request, prompt) : prompt,
        signal,
        timeoutMs: TURN_TIMEOUT_MS,
        onStdoutLine: (line) => {
          const event = parseJsonLine(line);
          if (!event) return;
          for (const item of turnParser.feed(event)) {
            upsert(session.id, items, { ...item, id: `${turnId}:${item.id}` });
            sinceSave += 1;
          }
          if (sinceSave >= SAVE_EVERY_ITEMS) {
            sinceSave = 0;
            persist(session.id, items);
          }
        },
      });
      const sawResult = items.some(
        (item) => item.kind === 'result' && item.id.startsWith(`${turnId}:`),
      );
      if (result.exitCode !== 0 && !sawResult) {
        notice(
          result.stderr.trim().slice(-STDERR_TAIL_CHARS) ||
            `${agent.binary} exited with code ${result.exitCode}`,
        );
      }
    } catch (error) {
      notice(
        error instanceof CommandAbortedError ? 'Stopped' : errorMessage(error),
      );
    } finally {
      session.agentSessionId = parser?.sessionId() ?? session.agentSessionId;
      finishTurn(owner, session, items);
    }
  }

  async function send(
    sessionId: string,
    options: SendOptions,
  ): Promise<Result> {
    const { owner, session } = locate(sessionId);
    const workspace = owner.kind === 'workspace' ? owner.workspace : null;
    if (workspace?.archivedAt)
      return { ok: false, message: 'Workspace is archived' };
    if (controllers.has(sessionId))
      return { ok: false, message: 'Agent is still working' };
    const items = await transcript(sessionId);
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
    if (isUntitled(session)) session.title = titleFrom(options.text);
    session.model = options.model;
    session.effort = options.effort;
    const controller = new AbortController();
    controllers.set(sessionId, controller);
    ctx.runningSessions.add(sessionId);
    if (workspace) ctx.setStatus(workspace.id, 'working');
    ctx.store.save();
    ctx.emitState();
    void runTurn(owner, session, options, items, controller.signal);
    if (workspace && firstMessage && session === workspace.sessions[0]) {
      void autoRenameBranch(workspace, options.text);
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
      const suggestion = await suggestName(ctx, text);
      if (!suggestion || !isPlaceholderBranch(workspace)) return;
      if (await hasUpstream(ctx.git, workspace.path)) return;
      const prefix = workspace.branch.split('/').slice(0, -1).join('/');
      const next = prefix ? `${prefix}/${suggestion}` : suggestion;
      const repo = ctx.repo(workspace.repoId);
      if (await branchExists(ctx.git, repo.path, next)) return;
      await renameBranch(ctx.git, workspace.path, workspace.branch, next);
      workspace.branch = next;
      ctx.store.save();
      ctx.emitState();
    } catch {
      return;
    }
  }

  function stop(sessionId: string) {
    controllers.get(sessionId)?.abort();
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
    if (controllers.has(sessionId))
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

  return {
    transcript,
    isRunning: (sessionId) => controllers.has(sessionId),
    send,
    stop,
    stopWorkspace: (workspace) =>
      workspace.sessions.forEach((session) => stop(session.id)),
    revert,
    async forget(sessionId) {
      stop(sessionId);
      transcripts.delete(sessionId);
      await ctx.store.removeTranscript(sessionId);
    },
  };
}
