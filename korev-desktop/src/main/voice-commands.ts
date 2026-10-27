import {
  finishedCodexPlan,
  type AgentQuestion,
  type ChatItem,
  type ChatSession,
  type PermissionResponse,
  type PlanLane,
  type Result,
  type SendOptions,
  type VoiceReply,
  type Workspace,
} from '../shared/model';
import { stripWakeWord } from '../shared/voice';
import { workspaceLabel } from '../shared/workspaces';
import type { Context } from './context';
import { askQuickModel, defaultTask } from './workspaces';

const PLAN_CHARS = 4_000;
const MESSAGE_CHARS = 1_500;
const SILENT: VoiceReply = { reply: '' };
const NOT_UNDERSTOOD = "Sorry, I didn't get that.";
const WHICH_WORKSPACE = 'Which workspace?';
const WHICH_REPO = 'Which repository, and what should the agent do?';
const NO_CHAT = 'That workspace has no chat.';

const VOICE_ACTIONS = [
  'create_workspace',
  'reply',
  'approve',
  'deny',
  'open',
  'stop',
  'say',
] as const;

type VoiceAction = (typeof VOICE_ACTIONS)[number];

export interface VoiceCommand {
  action: VoiceAction;
  reply: string;
  workspaceId?: string;
  repoId?: string;
  text?: string;
  planMode?: boolean;
  answers?: Record<string, string[]>;
}

const COMMAND_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    action: { type: 'string', enum: VOICE_ACTIONS },
    workspaceId: { type: 'string' },
    repoId: { type: 'string' },
    text: { type: 'string' },
    planMode: { type: 'boolean' },
    answers: {
      type: 'object',
      additionalProperties: { type: 'array', items: { type: 'string' } },
    },
    reply: { type: 'string' },
  },
  required: ['action', 'reply'],
});

const SYSTEM_PROMPT = `You are the voice of Korev, an app that runs coding agents in workspaces. Each workspace is a git worktree of one repository. The user talks to you while doing something else and cannot see the screen. Turn what they said into one action, using the JSON state you are given.
- create_workspace: start a new workspace in repoId. text is the full task for the agent, written as an instruction, keeping every detail the user gave. planMode is true when the user wants to plan first.
- reply: send text to the agent in workspaceId. To answer a pending question, put the chosen option labels in answers, keyed by the question text, and put anything else the user said in text.
- approve: approve the pending plan or tool request in workspaceId.
- deny: reject the pending plan or tool request in workspaceId. text says why.
- open: show workspaceId on the screen. "Next" means the next workspace with something pending, then the next unread one.
- stop: stop the agent in workspaceId.
- say: only answer. Use it to say what is waiting, what an agent said, or to summarize a plan.
If the user names no workspace, use the one where talkingTo is true. reply is what you say back to the user: one or two short spoken sentences, with no markdown.`;

const INTERPRET_ARGS = [
  '--output-format',
  'json',
  '--json-schema',
  COMMAND_SCHEMA,
  '--system-prompt',
  SYSTEM_PROMPT,
];

type PermissionItem = Extract<ChatItem, { kind: 'permission' }>;

export type Attention =
  | { kind: 'permission'; item: PermissionItem }
  | { kind: 'plan' | 'finished' | 'failed' };

type Pending =
  | { session: ChatSession; item: PermissionItem }
  | { session: ChatSession; codexPlan: string };

export interface VoiceActions {
  transcript(sessionId: string): Promise<ChatItem[]>;
  waitingSessions(): string[];
  isRunning(sessionId: string): boolean;
  createWorkspaces(
    repoIds: string[],
    task: SendOptions,
  ): Promise<Result<Workspace[]>>;
  send(sessionId: string, options: SendOptions): Promise<Result>;
  respondPermission(
    sessionId: string,
    itemId: string,
    response: PermissionResponse,
  ): Promise<Result>;
  approvePlan(sessionId: string, lanes: PlanLane[]): Promise<Result>;
  stop(sessionId: string): Promise<void>;
}

function spokenQuestion(question: AgentQuestion): string {
  return [
    question.question,
    ...question.options.map(
      (option, index) => `Option ${index + 1}, ${option.label}.`,
    ),
  ].join(' ');
}

function permissionAnnouncement(label: string, item: PermissionItem): string {
  if (item.questions)
    return `${label} asks: ${item.questions.map(spokenQuestion).join(' ')}`;
  if (item.plan !== null) return `${label} has a plan ready.`;
  return `${label} wants to use ${item.tool}: ${item.summary}`;
}

export function announcement(label: string, attention: Attention): string {
  switch (attention.kind) {
    case 'permission':
      return permissionAnnouncement(label, attention.item);
    case 'plan':
      return `${label} has a plan ready.`;
    case 'finished':
      return `${label} finished.`;
    case 'failed':
      return `${label} failed.`;
  }
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function describePending(pending: Pending) {
  if ('codexPlan' in pending)
    return { kind: 'plan', plan: clip(pending.codexPlan, PLAN_CHARS) };
  const { item } = pending;
  if (item.questions)
    return {
      kind: 'question',
      questions: item.questions.map((question) => ({
        question: question.question,
        options: question.options.map((option) => option.label),
        multiSelect: question.multiSelect,
      })),
    };
  if (item.plan !== null)
    return { kind: 'plan', plan: clip(item.plan, PLAN_CHARS) };
  return { kind: 'tool', tool: item.tool, summary: item.summary };
}

function parseCommand(stdout: string | null): VoiceCommand | null {
  if (!stdout) return null;
  try {
    const command = JSON.parse(stdout).structured_output as VoiceCommand;
    return VOICE_ACTIONS.includes(command?.action) ? command : null;
  } catch {
    return null;
  }
}

function sendOptions(session: ChatSession, command: VoiceCommand): SendOptions {
  return {
    text: command.text ?? '',
    answers: command.answers,
    agent: session.agent,
    model: session.model,
    effort: session.effort,
    planMode: session.planMode,
    fast: session.fast,
  };
}

export function createVoiceCommands(ctx: Context, actions: VoiceActions) {
  let talkingTo: string | null = null;

  function activeWorkspaces() {
    return ctx.store.state.workspaces.filter((ws) => !ws.archivedAt);
  }

  async function pendingIn(workspace: Workspace): Promise<Pending | null> {
    const waiting = new Set(actions.waitingSessions());
    for (const session of workspace.sessions) {
      if (waiting.has(session.id)) {
        const item = (await actions.transcript(session.id)).find(
          (entry): entry is PermissionItem =>
            entry.kind === 'permission' && entry.status === 'pending',
        );
        if (item) return { session, item };
      }
      if (session.agent !== 'codex' || !session.planMode) continue;
      const plan = finishedCodexPlan(
        session,
        await actions.transcript(session.id),
        actions.isRunning(session.id),
      );
      if (plan) return { session, codexPlan: plan.plan };
    }
    return null;
  }

  async function sessionFor(workspace: Workspace) {
    return (
      (await pendingIn(workspace))?.session ??
      workspace.sessions.find((session) =>
        ctx.runningSessions.has(session.id),
      ) ??
      workspace.sessions[0]
    );
  }

  async function lastMessage(workspace: Workspace) {
    const session = await sessionFor(workspace);
    if (!session) return undefined;
    const items = await actions.transcript(session.id);
    const last = items.findLast((item) => item.kind === 'assistant');
    return last?.kind === 'assistant'
      ? clip(last.text, MESSAGE_CHARS)
      : undefined;
  }

  async function workspaceSummary(workspace: Workspace) {
    const runtime = ctx.runtime(workspace.id);
    const pending = await pendingIn(workspace);
    const isTalkingTo = workspace.id === talkingTo;
    return {
      id: workspace.id,
      name: workspaceLabel(workspace),
      repo: ctx.store.state.repos.find((repo) => repo.id === workspace.repoId)
        ?.name,
      status: runtime.status,
      unread: runtime.unread,
      onScreen: ctx.focusedWorkspaceIds.includes(workspace.id),
      talkingTo: isTalkingTo,
      pending: pending ? describePending(pending) : undefined,
      lastMessage: isTalkingTo ? await lastMessage(workspace) : undefined,
    };
  }

  async function stateSummary() {
    return {
      repos: ctx.store.state.repos.map(({ id, name }) => ({ id, name })),
      workspaces: await Promise.all(activeWorkspaces().map(workspaceSummary)),
    };
  }

  async function interpret(sentence: string) {
    const state = JSON.stringify(await stateSummary());
    return parseCommand(
      await askQuickModel(
        ctx,
        INTERPRET_ARGS,
        `State:\n${state}\n\nThe user said: ${sentence}`,
      ),
    );
  }

  function targetWorkspace(workspaceId: string | undefined) {
    const active = activeWorkspaces();
    const ids = [workspaceId, talkingTo, ctx.focusedWorkspaceIds[0]];
    for (const id of ids) {
      const found = active.find((workspace) => workspace.id === id);
      if (found) return found;
    }
    return null;
  }

  async function createWorkspace(command: VoiceCommand): Promise<VoiceReply> {
    const { settings, repos } = ctx.store.state;
    const repo = repos.find((entry) => entry.id === command.repoId);
    if (!repo || !command.text) return { reply: WHICH_REPO };
    const created = await actions.createWorkspaces(
      [repo.id],
      defaultTask(
        ctx,
        command.text,
        command.planMode ?? settings.defaultPlanMode,
      ),
    );
    if (!created.ok) return { reply: created.message };
    talkingTo = created.value[0]?.id ?? talkingTo;
    return { reply: command.reply };
  }

  async function reply(workspace: Workspace, command: VoiceCommand) {
    const session = await sessionFor(workspace);
    if (!session) return { ok: false as const, message: NO_CHAT };
    return actions.send(session.id, sendOptions(session, command));
  }

  async function approve(workspace: Workspace): Promise<Result> {
    const pending = await pendingIn(workspace);
    if (!pending)
      return {
        ok: false,
        message: `Nothing is waiting in ${workspaceLabel(workspace)}.`,
      };
    if ('codexPlan' in pending)
      return actions.approvePlan(pending.session.id, []);
    return actions.respondPermission(pending.session.id, pending.item.id, {
      allow: true,
    });
  }

  async function deny(workspace: Workspace, command: VoiceCommand) {
    const pending = await pendingIn(workspace);
    if (!pending || 'codexPlan' in pending) return reply(workspace, command);
    return actions.respondPermission(pending.session.id, pending.item.id, {
      allow: false,
      message: command.text,
    });
  }

  async function stop(workspace: Workspace): Promise<Result> {
    const running = workspace.sessions.filter((session) =>
      ctx.runningSessions.has(session.id),
    );
    await Promise.all(running.map((session) => actions.stop(session.id)));
    return { ok: true, value: undefined };
  }

  const WORKSPACE_ACTIONS: Record<
    'reply' | 'approve' | 'deny' | 'stop',
    (workspace: Workspace, command: VoiceCommand) => Promise<Result>
  > = { reply, approve, deny, stop };

  async function perform(command: VoiceCommand): Promise<VoiceReply> {
    if (command.action === 'say') return { reply: command.reply };
    if (command.action === 'create_workspace') return createWorkspace(command);
    const workspace = targetWorkspace(command.workspaceId);
    if (!workspace) return { reply: WHICH_WORKSPACE };
    talkingTo = workspace.id;
    if (command.action === 'open')
      return { reply: command.reply, openWorkspaceId: workspace.id };
    const done = await WORKSPACE_ACTIONS[command.action](workspace, command);
    return { reply: done.ok ? command.reply : done.message };
  }

  return {
    async run(
      spoken: string,
      options: { awake?: boolean } = {},
    ): Promise<VoiceReply> {
      const sentence = options.awake ? spoken.trim() : stripWakeWord(spoken);
      if (sentence === null || (options.awake && !sentence)) return SILENT;
      if (!sentence) return { reply: '', listening: true };
      const command = await interpret(sentence);
      return command ? perform(command) : { reply: NOT_UNDERSTOOD };
    },
    announce(workspace: Workspace, attention: Attention) {
      talkingTo = workspace.id;
      ctx.deps.emit('announce', {
        workspaceId: workspace.id,
        text: announcement(workspaceLabel(workspace), attention),
      });
    },
  };
}
