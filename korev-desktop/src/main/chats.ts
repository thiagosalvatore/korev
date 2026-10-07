import { tmpdir } from 'node:os';
import type {
  ChatItem,
  ChatSession,
  Repo,
  Result,
  SendOptions,
  Workspace,
} from '../shared/model';
import { AGENTS, codexPrompt, type TurnRequest } from './agents';
import { parseJsonLine } from './agent-events';
import { CommandAbortedError } from './command-runner';
import { errorMessage, NotFoundError, type Context } from './context';
import {
  branchExists,
  createCheckpoint,
  hasUpstream,
  renameBranch,
  restoreCheckpoint,
  slugify,
} from './git';
import { isUntitled, refreshStats, scriptEnv } from './workspaces';

const TURN_TIMEOUT_MS = 12 * 60 * 60_000;
const TITLE_MAX_CHARS = 32;
const SAVE_EVERY_ITEMS = 20;
const STDERR_TAIL_CHARS = 2_000;
const REPLAY_ITEM_CHARS = 2_000;
const REPLAY_TOTAL_CHARS = 24_000;
const RENAME_TIMEOUT_MS = 60_000;
const RENAME_MODEL = 'claude-haiku-4-5';
const BRANCH_NAME_MAX_CHARS = 40;
const RENAME_TASK_CHARS = 4_000;

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

const RENAME_SYSTEM_PROMPT =
  'You name git branches. Given a task, reply with a 2 to 4 word lowercase kebab-case branch name and nothing else.';
const RENAME_ARGS = [
  '-p',
  '--model',
  RENAME_MODEL,
  '--no-session-persistence',
  '--output-format',
  'text',
  '--tools',
  '',
  '--setting-sources',
  '',
  '--disable-slash-commands',
  '--strict-mcp-config',
  '--system-prompt',
  RENAME_SYSTEM_PROMPT,
];

export function systemPrompt(repo: Repo, workspace: Workspace): string {
  return [
    `You are working inside Korev, a Mac app that lets the user run many coding agents in parallel.`,
    `Your work should take place in the ${workspace.path} directory (unless otherwise directed), which has been set up for you to work in.`,
    `It is a git worktree of ${repo.name} on branch ${workspace.branch}. The target branch for this workspace is origin/${workspace.baseBranch}. Use this for actions like diffing (\`git diff origin/${workspace.baseBranch}...\`) or creating PRs (\`gh pr create --base ${workspace.baseBranch}\`).`,
    `The workspace has a .context directory (gitignored) where you can save files to collaborate with other agents.`,
    `Do not rename the current branch unless the user explicitly tells you to do so.`,
    `If you start a dev server, use port $CONDUCTOR_PORT (ports $CONDUCTOR_PORT to $CONDUCTOR_PORT+9 are reserved for this workspace).`,
  ].join('\n');
}

function titleFrom(text: string): string {
  const line = text.trim().split('\n')[0];
  return line.length > TITLE_MAX_CHARS
    ? `${line.slice(0, TITLE_MAX_CHARS - 1).trimEnd()}…`
    : line;
}

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

  function locate(sessionId: string): {
    workspace: Workspace;
    session: ChatSession;
  } {
    for (const workspace of ctx.store.state.workspaces) {
      const session = workspace.sessions.find(
        (entry) => entry.id === sessionId,
      );
      if (session) return { workspace, session };
    }
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

  function finishTurn(
    workspace: Workspace,
    session: ChatSession,
    items: ChatItem[],
  ) {
    controllers.delete(session.id);
    ctx.runningSessions.delete(session.id);
    persist(session.id, items);
    const stillWorking = workspace.sessions.some((entry) =>
      ctx.runningSessions.has(entry.id),
    );
    const runtime = ctx.runtime(workspace.id);
    if (!stillWorking && runtime.status === 'working')
      ctx.setStatus(workspace.id, 'idle');
    const watching =
      ctx.deps.isWindowFocused() && ctx.focusedWorkspaceId === workspace.id;
    if (!watching) runtime.unread = true;
    ctx.store.save();
    ctx.emitState();
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

  async function runTurn(
    workspace: Workspace,
    session: ChatSession,
    options: SendOptions,
    items: ChatItem[],
    signal: AbortSignal,
  ) {
    const repo = ctx.repo(workspace.repoId);
    const agent = AGENTS[session.agent];
    const request: TurnRequest = {
      model: options.model,
      planMode: options.planMode,
      effort: options.effort,
      resumeId: session.agentSessionId,
      newSessionId: ctx.deps.newId(),
      systemPrompt: systemPrompt(repo, workspace),
    };
    const parser = agent.parser(workspace.path);
    const prompt = session.agentSessionId
      ? options.text
      : replayPrompt(items.slice(0, -1), options.text);
    const turnId = ctx.deps.newId().slice(0, 8);
    let sinceSave = 0;
    const notice = (text: string) =>
      upsert(session.id, items, {
        id: `${turnId}:notice`,
        kind: 'notice',
        text,
      });
    try {
      const result = await ctx.deps.run(agent.binary, agent.args(request), {
        cwd: workspace.path,
        env: scriptEnv(ctx, repo, workspace),
        stdin:
          session.agent === 'codex' ? codexPrompt(request, prompt) : prompt,
        signal,
        timeoutMs: TURN_TIMEOUT_MS,
        onStdoutLine: (line) => {
          const event = parseJsonLine(line);
          if (!event) return;
          for (const item of parser.feed(event)) {
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
      session.agentSessionId = parser.sessionId() ?? session.agentSessionId;
      finishTurn(workspace, session, items);
    }
  }

  async function send(
    sessionId: string,
    options: SendOptions,
  ): Promise<Result> {
    const { workspace, session } = locate(sessionId);
    if (workspace.archivedAt)
      return { ok: false, message: 'Workspace is archived' };
    if (controllers.has(sessionId))
      return { ok: false, message: 'Agent is still working' };
    const items = await transcript(sessionId);
    const firstMessage = !items.some((item) => item.kind === 'user');
    const checkpoint = await createCheckpoint(ctx.git, workspace.path).catch(
      () => null,
    );
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
    ctx.setStatus(workspace.id, 'working');
    ctx.store.save();
    ctx.emitState();
    void runTurn(workspace, session, options, items, controller.signal);
    if (firstMessage && session === workspace.sessions[0]) {
      void autoRenameBranch(workspace, options.text);
    }
    return { ok: true, value: undefined };
  }

  function isPlaceholderBranch(workspace: Workspace) {
    return workspace.branch.split('/').at(-1) === workspace.name;
  }

  async function suggestBranchName(workspace: Workspace, text: string) {
    const result = await ctx.deps.run('claude', RENAME_ARGS, {
      cwd: tmpdir(),
      env: ctx.deps.env,
      stdin: `Task:\n${text.slice(0, RENAME_TASK_CHARS)}`,
      timeoutMs: RENAME_TIMEOUT_MS,
    });
    if (result.exitCode !== 0) return null;
    return (
      slugify(result.stdout.trim().split('\n').at(-1) ?? '')
        .slice(0, BRANCH_NAME_MAX_CHARS)
        .replace(/-+$/, '') || null
    );
  }

  async function autoRenameBranch(workspace: Workspace, text: string) {
    if (
      !ctx.store.state.settings.autoRenameBranches ||
      !isPlaceholderBranch(workspace)
    )
      return;
    try {
      const suggestion = await suggestBranchName(workspace, text);
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

  async function revert(
    sessionId: string,
    itemId: string,
  ): Promise<Result<string>> {
    const { workspace, session } = locate(sessionId);
    if (controllers.has(sessionId))
      return { ok: false, message: 'Stop the agent first' };
    const items = await transcript(sessionId);
    const target = items.find((item) => item.id === itemId);
    if (target?.kind !== 'user' || !target.checkpoint) {
      return { ok: false, message: 'No checkpoint for this message' };
    }
    try {
      await restoreCheckpoint(ctx.git, workspace.path, target.checkpoint);
    } catch (error) {
      return { ok: false, message: errorMessage(error) };
    }
    items.splice(items.indexOf(target));
    session.agentSessionId = null;
    persist(sessionId, items);
    ctx.store.save();
    ctx.emitState();
    void refreshStats(ctx, workspace);
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
