import { lastFencedBlock } from '../shared/explainer';
import type {
  AskChat,
  Automation,
  AutomationDraft,
  AutomationRun,
  ChatSession,
  Repo,
  Result,
  SendOptions,
  Workspace,
} from '../shared/model';
import type { TurnOutcome } from './chats';
import { errorMessage, NotFoundError, type Context } from './context';
import { newChatSession } from './workspaces';

export const AUTOMATION_TICK_MS = 60_000;
const AUTOMATION_FENCE = 'korev-automation';
const MINUTE_MS = 60_000;
const MIN_INTERVAL_MINUTES = 1;
const MAX_WORKSPACES_PER_RUN = 5;
const MAX_USED_KEYS = 500;
const MAX_RUNS_KEPT = 20;
const STILL_RUNNING = 'This automation is still running.';
const STOPPED = 'Stopped before the run finished.';
const INCOMPLETE_ENTRY = 'Skipped a workspace without a repo, key or prompt.';

const SHAPE = `{
  "workspaces": [
    { "repo": "repository name", "key": "TICKET-123", "prompt": "Everything the agent in the workspace needs to do the work." }
  ]
}`;

interface RequestedWorkspace {
  repo: string;
  key: string;
  prompt: string;
}

export interface AutomationHost {
  send(sessionId: string, options: SendOptions): Promise<Result>;
  isRunning(sessionId: string): boolean;
  addAskChat(repoIds: string[], session: ChatSession): AskChat;
  deleteAskChat(askChatId: string): Promise<void>;
  createWorkspaces(repoIds: string[], task: SendOptions): Result<Workspace[]>;
}

export interface Automations {
  create(draft: AutomationDraft): Automation;
  update(automationId: string, patch: Partial<AutomationDraft>): void;
  remove(automationId: string): Promise<void>;
  runNow(automationId: string): Promise<Result<string>>;
  tick(): void;
  turnFinished(session: ChatSession, outcome: TurnOutcome): void;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function requestedWorkspace(value: unknown): RequestedWorkspace {
  const entry = (value ?? {}) as Record<string, unknown>;
  return {
    repo: text(entry.repo),
    key: text(entry.key),
    prompt: text(entry.prompt),
  };
}

function parseAutomationReply(reply: string): Result<RequestedWorkspace[]> {
  const block = lastFencedBlock(reply, AUTOMATION_FENCE);
  if (block === null)
    return {
      ok: false,
      message: `The reply has no \`\`\`${AUTOMATION_FENCE} block.`,
    };
  try {
    const { workspaces } = JSON.parse(block) as { workspaces?: unknown };
    if (!Array.isArray(workspaces))
      return {
        ok: false,
        message: `The ${AUTOMATION_FENCE} block has no "workspaces" list.`,
      };
    return { ok: true, value: workspaces.map(requestedWorkspace) };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

function openedMessage(count: number): string {
  return count === 1 ? 'Opened 1 workspace.' : `Opened ${count} workspaces.`;
}

export function createAutomations(
  ctx: Context,
  host: AutomationHost,
): Automations {
  const automations = () => ctx.store.state.automations;

  function saveAndEmit() {
    ctx.store.save();
    ctx.emitState();
  }

  function find(automationId: string): Automation {
    const found = automations().find((entry) => entry.id === automationId);
    if (!found) throw new NotFoundError('Automation', automationId);
    return found;
  }

  function cleaned(draft: AutomationDraft): AutomationDraft {
    const name = draft.name.trim();
    const prompt = draft.prompt.trim();
    if (!name) throw new Error('An automation needs a name');
    if (!prompt) throw new Error('An automation needs a prompt');
    if (!(draft.intervalMinutes >= MIN_INTERVAL_MINUTES))
      throw new Error('An automation runs at most once a minute');
    for (const repoId of draft.repoIds) ctx.repo(repoId);
    return {
      name,
      prompt,
      intervalMinutes: Math.round(draft.intervalMinutes),
      repoIds: draft.repoIds,
      enabled: draft.enabled,
    };
  }

  function runsOf(automationId: string): AskChat[] {
    return ctx.store.state.askChats.filter(
      (ask) => ask.automationRun?.automationId === automationId,
    );
  }

  function isRunning(automation: Automation): boolean {
    return runsOf(automation.id).some((ask) => host.isRunning(ask.session.id));
  }

  function isDue(automation: Automation): boolean {
    if (!automation.enabled) return false;
    if (!automation.lastRunAt) return true;
    const elapsed =
      ctx.deps.now().getTime() - new Date(automation.lastRunAt).getTime();
    return elapsed >= automation.intervalMinutes * MINUTE_MS;
  }

  function allowedRepo(automation: Automation, name: string): Repo | null {
    return (
      ctx.store.state.repos.find(
        (repo) => automation.repoIds.includes(repo.id) && repo.name === name,
      ) ?? null
    );
  }

  function defaultTask(prompt: string, planMode: boolean): SendOptions {
    const { defaultAgent, defaultModels, defaultEffort } =
      ctx.store.state.settings;
    return {
      text: prompt,
      agent: defaultAgent,
      model: defaultModels[defaultAgent],
      effort: defaultEffort[defaultAgent],
      planMode,
      fast: false,
    };
  }

  function runPrompt(automation: Automation): string {
    const repos = ctx.store.state.repos
      .filter((repo) => automation.repoIds.includes(repo.id))
      .map((repo) => repo.name);
    const usedKeys = automation.usedKeys.length
      ? ` Keys already used: ${automation.usedKeys.join(', ')}.`
      : '';
    return [
      automation.prompt,
      '',
      '---',
      `Korev runs this prompt every ${automation.intervalMinutes} minutes. Nobody watches this chat while you work, so do not ask questions. Do the work, then say what you found.`,
      repos.length
        ? `Korev can open a workspace for each piece of work that needs code changes: a git worktree on a new branch, where a coding agent starts with the prompt you write. You can open workspaces in these repositories: ${repos.join(', ')}.`
        : `This automation has no repositories, so do not ask Korev to open workspaces.`,
      `Give each workspace a key that names what it handles, such as a ticket id. Korev never opens two workspaces with the same key.${usedKeys}`,
      `The agent in a workspace knows only the prompt you write, so put the details, the links and what done looks like in it.`,
      `End your reply with exactly one fenced block that starts with \`\`\`${AUTOMATION_FENCE} and holds JSON in this shape. Use an empty list when there is nothing to open:`,
      '',
      SHAPE,
    ].join('\n');
  }

  async function pruneRuns(automationId: string) {
    const stale = runsOf(automationId)
      .slice(0, -MAX_RUNS_KEPT)
      .filter((ask) => !host.isRunning(ask.session.id));
    for (const ask of stale) await host.deleteAskChat(ask.id);
  }

  async function start(automation: Automation): Promise<Result<string>> {
    const session: ChatSession = {
      ...newChatSession(ctx, ctx.store.state.settings.defaultAgent),
      title: automation.name,
    };
    const ask = host.addAskChat([], session);
    ask.automationRun = {
      automationId: automation.id,
      workspaceIds: [],
      notes: [],
    };
    automation.lastRunAt = ctx.deps.now().toISOString();
    saveAndEmit();
    await pruneRuns(automation.id);
    const sent = await host.send(
      session.id,
      defaultTask(runPrompt(automation), false),
    );
    return sent.ok ? { ok: true, value: ask.id } : sent;
  }

  function record(run: AutomationRun, note: string) {
    run.notes.push(note);
    saveAndEmit();
  }

  function openWorkspace(
    automation: Automation,
    run: AutomationRun,
    entry: RequestedWorkspace,
  ): string | null {
    if (!entry.repo || !entry.key || !entry.prompt) return INCOMPLETE_ENTRY;
    if (run.workspaceIds.length >= MAX_WORKSPACES_PER_RUN)
      return `Skipped ${entry.key}: a run opens at most ${MAX_WORKSPACES_PER_RUN} workspaces.`;
    if (automation.usedKeys.includes(entry.key))
      return `Skipped ${entry.key}: it already has a workspace.`;
    const repo = allowedRepo(automation, entry.repo);
    if (!repo)
      return `Skipped ${entry.key}: ${entry.repo} is not one of this automation's repositories.`;
    const created = host.createWorkspaces(
      [repo.id],
      defaultTask(entry.prompt, ctx.store.state.settings.defaultPlanMode),
    );
    if (!created.ok)
      return `Could not open a workspace for ${entry.key}: ${created.message}`;
    automation.usedKeys = [...automation.usedKeys, entry.key].slice(
      -MAX_USED_KEYS,
    );
    run.workspaceIds.push(...created.value.map((workspace) => workspace.id));
    return null;
  }

  function openWorkspaces(
    automation: Automation,
    run: AutomationRun,
    requested: RequestedWorkspace[],
  ) {
    for (const entry of requested) {
      const note = openWorkspace(automation, run, entry);
      if (note) record(run, note);
    }
    saveAndEmit();
    if (!run.workspaceIds.length) return;
    ctx.deps.notify({
      title: automation.name,
      body: openedMessage(run.workspaceIds.length),
      workspaceId: run.workspaceIds[0],
    });
  }

  function turnFinished(session: ChatSession, outcome: TurnOutcome) {
    const run = ctx.store.state.askChats.find(
      (ask) => ask.session.id === session.id,
    )?.automationRun;
    if (!run) return;
    const automation = automations().find(
      (entry) => entry.id === run.automationId,
    );
    if (!automation) return;
    if (outcome.stopped) return record(run, STOPPED);
    const parsed = parseAutomationReply(outcome.reply);
    if (!parsed.ok) return record(run, parsed.message);
    openWorkspaces(automation, run, parsed.value);
  }

  function tick() {
    for (const automation of automations()) {
      if (!isDue(automation) || isRunning(automation)) continue;
      ctx.background(start(automation).then(() => undefined));
    }
  }

  return {
    create(draft) {
      const automation: Automation = {
        ...cleaned(draft),
        id: ctx.deps.newId(),
        createdAt: ctx.deps.now().toISOString(),
        lastRunAt: null,
        usedKeys: [],
      };
      automations().push(automation);
      saveAndEmit();
      return automation;
    },
    update(automationId, patch) {
      const automation = find(automationId);
      Object.assign(automation, cleaned({ ...automation, ...patch }));
      saveAndEmit();
    },
    async remove(automationId) {
      find(automationId);
      for (const ask of runsOf(automationId)) await host.deleteAskChat(ask.id);
      ctx.store.state.automations = automations().filter(
        (entry) => entry.id !== automationId,
      );
      saveAndEmit();
    },
    async runNow(automationId) {
      const automation = find(automationId);
      if (isRunning(automation)) return { ok: false, message: STILL_RUNNING };
      return start(automation);
    },
    tick,
    turnFinished,
  };
}
