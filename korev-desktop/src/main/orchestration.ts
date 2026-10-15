import { parseArgs } from 'node:util';
import {
  AGENT_KINDS,
  taskState,
  type AgentKind,
  type ChatItem,
  type ChatSession,
  type OrchestrationRun,
  type OrchestrationTask,
  type PlanLane,
  type Result,
  type SendOptions,
  type TaskOutcome,
  type Workspace,
} from '../shared/model';
import type { CliCall, CliReply } from './agent-server';
import { errorMessage, type Context } from './context';
import { commitsBehind } from './git';

export const MAX_RUN_DEPTH = 2;
export const MAX_WAKES_PER_RUN = 100;
export const STALE_COMMIT_LIMIT = 20;
const TASK_ID_PREFIX = 't';
const COORDINATOR = '@coordinator';
const MESSAGE_TYPES = ['status', 'escalation', 'handoff', 'merge_ready'];
const OUTCOMES: TaskOutcome[] = ['succeeded', 'failed'];
const SETTABLE_STATUSES = ['pending', 'completed', 'failed'] as const;
const LIST_SEPARATOR = ',';
const RUN_PAUSED_TITLE = 'Orchestration paused';

export const GUIDE = `korev: coordinate other agents from inside a Korev workspace.

A coordinator splits work into tasks and starts a worker agent for each one.
Each worker gets its own linked workspace (a git worktree on its own branch).
Messages arrive in the other agent's chat, so nobody has to poll: after you
start workers or send a message, end your turn. Korev wakes you with the next
message.

Coordinator
  korev run create --objective "<what the whole run delivers>"
  korev run show [--json]
  korev task create --title "<short name>" --spec "<everything the worker needs>"
                    [--deps t1,t2] [--repo <repository name>]
      A task waits until every task in --deps is completed. A task can only
      depend on tasks created before it.
  korev task list [--ready] [--json]
  korev task update --id t1 [--title ...] [--spec ...] [--deps ...]
                    [--status pending|completed|failed]
  korev worker start --task t1 [--agent claude|codex] [--model <id>]
                     [--effort <level>] [--workspace <name>] [--allow-stale]
      Starts a worker in a new linked workspace. --workspace reuses the
      workspace of a finished worker instead. Korev refuses a reused
      workspace that is more than ${STALE_COMMIT_LIMIT} commits behind its base unless you
      pass --allow-stale.
  korev worker list [--json]
  korev worker stop --task t1       Stop the worker. The task can be restarted.
  korev worker release --task t1    Archive a finished worker's workspace.

Worker
  korev done --outcome succeeded|failed --summary "<what you did and what is left>"
             [--files a.ts,b.ts]
      Run exactly once, when the task is finished or you cannot finish it.
      Then end your turn.

Everyone
  korev send --to <target> --body "<text>" [--type status|escalation|handoff|merge_ready]
      Targets: @coordinator, @all (every worker in the run), @idle (workers
      that are not running), @claude, @codex, a task id (t1) or a linked
      workspace name.

Rules
  - Korev tells the coordinator when a worker's turn ends without korev done.
  - A run stops delivering messages after ${MAX_WAKES_PER_RUN} of them. The user then decides
    whether to resume it.
  - A worker can create its own run for sub-tasks, up to ${MAX_RUN_DEPTH} levels below the
    top coordinator.
`;

export interface OrchestrationDeps {
  ctx: Context;
  send(sessionId: string, options: SendOptions): Promise<Result>;
  continueChat(sessionId: string, text: string): Promise<Result>;
  startWorker(origin: Workspace, lane: PlanLane, task: SendOptions): Workspace;
  stopWorkspace(workspace: Workspace): void;
  archive(workspaceId: string): Promise<Result>;
  transcript(sessionId: string): Promise<ChatItem[]>;
}

export interface Orchestration {
  runCli(call: CliCall): Promise<CliReply>;
  turnFinished(sessionId: string): Promise<void>;
  workspaceArchived(workspaceId: string): Promise<void>;
  resumeRun(runId: string): Promise<Result>;
}

type Command = (call: CliCall, args: string[]) => Promise<CliReply>;

class CliError extends Error {}

function done(output: string): CliReply {
  return { ok: true, output };
}

function failed(output: string): CliReply {
  return { ok: false, output };
}

function ok(): Result {
  return { ok: true, value: undefined };
}

function list(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(LIST_SEPARATOR)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function required(value: string | undefined, flag: string): string {
  if (!value?.trim()) throw new CliError(`Missing --${flag}.`);
  return value.trim();
}

function oneOf<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  flag: string,
): T {
  if (allowed.includes(value as T)) return value as T;
  throw new CliError(`--${flag} must be one of: ${allowed.join(', ')}.`);
}

function flags<T extends Record<string, 'string' | 'boolean'>>(
  args: string[],
  spec: T,
): { [K in keyof T]?: T[K] extends 'boolean' ? boolean : string } {
  const options = Object.fromEntries(
    Object.entries(spec).map(([name, type]) => [name, { type }]),
  );
  try {
    return parseArgs({ args, options, strict: true }).values as never;
  } catch (error) {
    throw new CliError(errorMessage(error));
  }
}

export function korevMessage(from: string, type: string, body: string) {
  return `<korev-message from="${from}" type="${type}">\n${body}\n</korev-message>`;
}

function taskLine(run: OrchestrationRun, task: OrchestrationTask): string {
  const deps = task.deps.length ? ` (after ${task.deps.join(', ')})` : '';
  const result = task.result ? ` - ${task.result.summary}` : '';
  return `${task.id} [${taskState(run, task)}] ${task.title}${deps}${result}`;
}

function taskJson(run: OrchestrationRun, task: OrchestrationTask) {
  return { ...task, state: taskState(run, task) };
}

export function workerPreamble(
  run: OrchestrationRun,
  task: OrchestrationTask,
): string {
  return [
    `You are a worker in a Korev orchestration run. Another agent, the coordinator, gave you this task.`,
    `Task ${task.id}: ${task.title}`,
    run.objective ? `Objective of the whole run: ${run.objective}` : null,
    task.spec,
    [
      `Work only in this workspace and commit on its branch.`,
      `When you finish, or cannot finish, run exactly once: korev done --outcome succeeded|failed --summary "<what you did, what changed, what is left>" [--files a,b]. Then end your turn.`,
      `To tell the coordinator something earlier: korev send --to ${COORDINATOR} --type status|escalation --body "<text>".`,
      `Run korev help to see every command.`,
    ].join('\n'),
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function createOrchestration(deps: OrchestrationDeps): Orchestration {
  const { ctx } = deps;
  const runs = () => ctx.store.state.runs;

  function saveAndEmit() {
    ctx.store.save();
    ctx.emitState();
  }

  function workspaceChat(sessionId: string) {
    for (const workspace of ctx.store.state.workspaces) {
      const session = workspace.sessions.find(
        (entry) => entry.id === sessionId,
      );
      if (session) return { workspace, session };
    }
    throw new CliError('Only agents in a workspace can run korev commands.');
  }

  function coordinatedRun(sessionId: string) {
    return runs().findLast((run) => run.coordinatorSessionId === sessionId);
  }

  function workerTask(sessionId: string) {
    for (const run of runs().toReversed()) {
      const task = run.tasks.find((entry) => entry.sessionId === sessionId);
      if (task) return { run, task };
    }
    return null;
  }

  function activeTask(sessionId: string) {
    const found = workerTask(sessionId);
    return found?.task.status === 'dispatched' ? found : null;
  }

  function requireRun(sessionId: string) {
    const run = coordinatedRun(sessionId);
    if (!run)
      throw new CliError(
        'You do not coordinate a run yet. Run `korev run create` first.',
      );
    return run;
  }

  function findTask(run: OrchestrationRun, id: string | undefined) {
    const task = run.tasks.find((entry) => entry.id === required(id, 'task'));
    if (!task) throw new CliError(`There is no task ${id} in this run.`);
    return task;
  }

  function createRun(sessionId: string, objective: string): OrchestrationRun {
    const { workspace } = workspaceChat(sessionId);
    const parent = workerTask(sessionId)?.run ?? null;
    const depth = parent ? parent.depth + 1 : 0;
    if (depth > MAX_RUN_DEPTH)
      throw new CliError(
        `Runs can nest only ${MAX_RUN_DEPTH} levels deep. Do this task yourself.`,
      );
    const existing = coordinatedRun(sessionId);
    if (existing?.tasks.some((task) => task.status === 'dispatched'))
      throw new CliError(
        'Your current run still has workers running. Finish or stop them first.',
      );
    const run: OrchestrationRun = {
      id: ctx.deps.newId(),
      coordinatorSessionId: sessionId,
      coordinatorWorkspaceId: workspace.id,
      objective,
      depth,
      parentRunId: parent?.id ?? null,
      tasks: [],
      wakes: 0,
      paused: false,
      heldMessages: [],
      createdAt: ctx.deps.now().toISOString(),
    };
    runs().push(run);
    saveAndEmit();
    return run;
  }

  function checkedDeps(run: OrchestrationRun, ids: string[], before: number) {
    const earlier = new Set(run.tasks.slice(0, before).map((task) => task.id));
    const unknown = ids.filter((id) => !earlier.has(id));
    if (unknown.length)
      throw new CliError(
        `A task can only depend on tasks created before it. Not allowed: ${unknown.join(', ')}.`,
      );
    return ids;
  }

  function repoNamed(name: string | undefined): string | null {
    if (!name) return null;
    const repo = ctx.store.state.repos.find((entry) => entry.name === name);
    if (!repo) throw new CliError(`There is no repository named ${name}.`);
    return repo.id;
  }

  function countWake(run: OrchestrationRun) {
    if (run.paused) return;
    run.wakes += 1;
    if (run.wakes <= MAX_WAKES_PER_RUN) return;
    run.paused = true;
    const coordinator = ctx.workspace(run.coordinatorWorkspaceId);
    ctx.deps.notify({
      title: RUN_PAUSED_TITLE,
      body: `${coordinator.name} reached ${MAX_WAKES_PER_RUN} messages. Resume the run to keep going.`,
      workspaceId: coordinator.id,
    });
  }

  function wake(run: OrchestrationRun, text: string): Promise<Result> {
    countWake(run);
    if (run.paused) run.heldMessages.push(text);
    saveAndEmit();
    if (run.paused) return Promise.resolve(ok());
    return deps.continueChat(run.coordinatorSessionId, text);
  }

  function deliver(
    run: OrchestrationRun,
    sessionId: string,
    text: string,
  ): Promise<Result> {
    if (sessionId === run.coordinatorSessionId) return wake(run, text);
    countWake(run);
    saveAndEmit();
    if (run.paused)
      return Promise.resolve({
        ok: false,
        message: 'This run is paused. The user has to resume it in Korev.',
      });
    return deps.continueChat(sessionId, text);
  }

  function senderName(sessionId: string): string {
    const task = workerTask(sessionId)?.task;
    if (task) return `worker of ${task.id}`;
    return coordinatedRun(sessionId) ? 'coordinator' : 'agent';
  }

  function agentOptions(
    coordinator: ChatSession,
    values: { agent?: string; model?: string; effort?: string },
    text: string,
  ): SendOptions {
    const agent = values.agent
      ? oneOf(values.agent, AGENT_KINDS, 'agent')
      : coordinator.agent;
    const sameAgent = agent === coordinator.agent;
    const { settings } = ctx.store.state;
    return {
      text,
      agent,
      model:
        values.model ??
        (sameAgent ? coordinator.model : settings.defaultModels[agent]),
      effort:
        values.effort ??
        (sameAgent ? coordinator.effort : settings.defaultEffort[agent]),
      planMode: false,
      fast: sameAgent && coordinator.fast,
    };
  }

  function linkedWorkspace(origin: Workspace, name: string) {
    const workspace = ctx.store.state.workspaces.find(
      (entry) =>
        (entry.id === name || entry.name === name) &&
        entry.groupId !== null &&
        entry.groupId === origin.groupId &&
        !entry.archivedAt,
    );
    if (!workspace)
      throw new CliError(`There is no linked workspace named ${name}.`);
    return workspace;
  }

  async function reuseWorkspace(
    origin: Workspace,
    name: string,
    allowStale: boolean,
  ) {
    const workspace = linkedWorkspace(origin, name);
    if (workspace.sessions.some((s) => ctx.runningSessions.has(s.id)))
      throw new CliError(`${workspace.name} is still running.`);
    const behind = await commitsBehind(
      ctx.git,
      workspace.path,
      workspace.baseBranch,
    );
    if (behind > STALE_COMMIT_LIMIT && !allowStale)
      throw new CliError(
        `${workspace.name} is ${behind} commits behind origin/${workspace.baseBranch}. Start the worker in a new workspace, or pass --allow-stale.`,
      );
    return workspace;
  }

  const commands: Record<string, Command> = {
    help: async () => done(GUIDE),

    'run create': async (call, args) => {
      const values = flags(args, { objective: 'string' });
      createRun(call.sessionId, required(values.objective, 'objective'));
      return done(
        'Created a run. Add tasks with `korev task create`, then start workers with `korev worker start`.',
      );
    },

    'run show': async (call, args) => {
      const values = flags(args, { json: 'boolean' });
      const run = requireRun(call.sessionId);
      if (values.json)
        return done(
          JSON.stringify({
            ...run,
            tasks: run.tasks.map((task) => taskJson(run, task)),
          }),
        );
      return done(
        [
          `Objective: ${run.objective || '(none)'}`,
          run.paused ? 'Paused: waiting for the user to resume the run.' : null,
          ...run.tasks.map((task) => taskLine(run, task)),
        ]
          .filter(Boolean)
          .join('\n'),
      );
    },

    'task create': async (call, args) => {
      const values = flags(args, {
        title: 'string',
        spec: 'string',
        deps: 'string',
        repo: 'string',
      });
      const run =
        coordinatedRun(call.sessionId) ?? createRun(call.sessionId, '');
      const task: OrchestrationTask = {
        id: `${TASK_ID_PREFIX}${run.tasks.length + 1}`,
        title: required(values.title, 'title'),
        spec: required(values.spec, 'spec'),
        deps: checkedDeps(run, list(values.deps), run.tasks.length),
        repoId: repoNamed(values.repo),
        status: 'pending',
        workspaceId: null,
        sessionId: null,
        result: null,
      };
      run.tasks.push(task);
      saveAndEmit();
      return done(`Created ${task.id} [${taskState(run, task)}].`);
    },

    'task list': async (call, args) => {
      const values = flags(args, { ready: 'boolean', json: 'boolean' });
      const run = requireRun(call.sessionId);
      const tasks = run.tasks.filter(
        (task) => !values.ready || taskState(run, task) === 'ready',
      );
      if (values.json)
        return done(JSON.stringify(tasks.map((task) => taskJson(run, task))));
      if (!tasks.length) return done('No tasks.');
      return done(tasks.map((task) => taskLine(run, task)).join('\n'));
    },

    'task update': async (call, args) => {
      const values = flags(args, {
        id: 'string',
        title: 'string',
        spec: 'string',
        deps: 'string',
        status: 'string',
      });
      const run = requireRun(call.sessionId);
      const task = findTask(run, values.id);
      if (values.title) task.title = values.title.trim();
      if (values.spec) task.spec = values.spec.trim();
      if (values.deps !== undefined)
        task.deps = checkedDeps(
          run,
          list(values.deps),
          run.tasks.indexOf(task),
        );
      if (values.status) {
        if (task.status === 'dispatched')
          throw new CliError(
            `${task.id} has a running worker. Stop it with \`korev worker stop\` first.`,
          );
        task.status = oneOf(values.status, SETTABLE_STATUSES, 'status');
      }
      saveAndEmit();
      return done(taskLine(run, task));
    },

    'worker start': async (call, args) => {
      const values = flags(args, {
        task: 'string',
        agent: 'string',
        model: 'string',
        effort: 'string',
        workspace: 'string',
        'allow-stale': 'boolean',
      });
      const run = requireRun(call.sessionId);
      if (run.paused)
        throw new CliError(
          'This run is paused. The user has to resume it in Korev.',
        );
      const task = findTask(run, values.task);
      const state = taskState(run, task);
      if (state === 'pending')
        throw new CliError(`${task.id} waits for ${task.deps.join(', ')}.`);
      if (state === 'dispatched' || state === 'completed')
        throw new CliError(`${task.id} is already ${state}.`);
      const coordinator = workspaceChat(call.sessionId);
      const options = agentOptions(
        coordinator.session,
        values,
        workerPreamble(run, task),
      );
      const workspace = values.workspace
        ? await reuseWorkspace(
            coordinator.workspace,
            values.workspace,
            values['allow-stale'] ?? false,
          )
        : deps.startWorker(
            coordinator.workspace,
            {
              name: task.title,
              body: task.spec,
              repoId: task.repoId ?? undefined,
            },
            options,
          );
      Object.assign(task, {
        status: 'dispatched',
        result: null,
        workspaceId: workspace.id,
        sessionId: workspace.sessions[0].id,
      });
      saveAndEmit();
      if (values.workspace) {
        const sent = await deps.send(workspace.sessions[0].id, options);
        if (!sent.ok) {
          task.status = 'failed';
          saveAndEmit();
          throw new CliError(sent.message);
        }
      }
      return done(
        `Started a worker for ${task.id} in workspace ${workspace.name}. Its report arrives as a message in this chat. End your turn unless you have other work.`,
      );
    },

    'worker list': async (call, args) => {
      const values = flags(args, { json: 'boolean' });
      const run = requireRun(call.sessionId);
      const workers = run.tasks
        .filter((task) => task.workspaceId)
        .map((task) => {
          const workspace = ctx.store.state.workspaces.find(
            (entry) => entry.id === task.workspaceId,
          );
          return {
            task: task.id,
            state: taskState(run, task),
            workspace: workspace?.name ?? null,
            status: workspace?.archivedAt
              ? 'archived'
              : ctx.runtime(task.workspaceId ?? '').status,
          };
        });
      if (values.json) return done(JSON.stringify(workers));
      if (!workers.length) return done('No workers yet.');
      return done(
        workers
          .map(
            (worker) =>
              `${worker.task} [${worker.state}] ${worker.workspace}: ${worker.status}`,
          )
          .join('\n'),
      );
    },

    'worker stop': async (call, args) => {
      const run = requireRun(call.sessionId);
      const task = findTask(run, flags(args, { task: 'string' }).task);
      if (task.status !== 'dispatched' || !task.workspaceId)
        throw new CliError(`${task.id} has no running worker.`);
      task.status = 'interrupted';
      saveAndEmit();
      deps.stopWorkspace(ctx.workspace(task.workspaceId));
      return done(
        `Stopped the worker of ${task.id}. Start it again with \`korev worker start --task ${task.id} --workspace <name>\`.`,
      );
    },

    'worker release': async (call, args) => {
      const run = requireRun(call.sessionId);
      const task = findTask(run, flags(args, { task: 'string' }).task);
      if (!task.workspaceId) throw new CliError(`${task.id} has no worker.`);
      if (task.status === 'dispatched')
        throw new CliError(
          `${task.id} is still running. Stop it with \`korev worker stop\` first.`,
        );
      const archived = await deps.archive(task.workspaceId);
      if (!archived.ok) throw new CliError(archived.message);
      return done(`Archived the workspace of ${task.id}.`);
    },

    done: async (call, args) => {
      const values = flags(args, {
        outcome: 'string',
        summary: 'string',
        files: 'string',
      });
      const found = activeTask(call.sessionId);
      if (!found) throw new CliError('You have no running task to report on.');
      const { run, task } = found;
      const outcome = oneOf(values.outcome, OUTCOMES, 'outcome');
      const summary = required(values.summary, 'summary');
      task.status = outcome === 'succeeded' ? 'completed' : 'failed';
      task.result = { outcome, summary, files: list(values.files) };
      const sent = await wake(run, doneMessage(run, task));
      if (!sent.ok) return failed(`Recorded, but ${sent.message}.`);
      return done('Reported to the coordinator. End your turn now.');
    },

    send: async (call, args) => {
      const values = flags(args, {
        to: 'string',
        body: 'string',
        type: 'string',
      });
      const type = values.type
        ? oneOf(values.type, MESSAGE_TYPES, 'type')
        : MESSAGE_TYPES[0];
      const body = required(values.body, 'body');
      const { run, sessionIds } = recipients(
        call.sessionId,
        required(values.to, 'to'),
      );
      if (!sessionIds.length) return done('Nobody matched that target.');
      const text = korevMessage(senderName(call.sessionId), type, body);
      const results = await Promise.all(
        sessionIds.map((sessionId) => deliver(run, sessionId, text)),
      );
      const problems = results.flatMap((result) =>
        result.ok ? [] : [result.message],
      );
      if (problems.length) return failed(problems.join('\n'));
      return done(`Sent to ${sessionIds.length} agent(s).`);
    },
  };

  function doneMessage(run: OrchestrationRun, task: OrchestrationTask) {
    const result = task.result!;
    const ready = run.tasks.filter(
      (other) =>
        other.deps.includes(task.id) && taskState(run, other) === 'ready',
    );
    const allDone = run.tasks.every((entry) => entry.status === 'completed');
    return korevMessage(
      `worker of ${task.id}`,
      'worker_done',
      [
        `${task.id} (${task.title}) ${result.outcome}.`,
        result.summary,
        result.files.length ? `Files: ${result.files.join(', ')}` : null,
        ready.length
          ? `Now ready: ${ready.map((entry) => entry.id).join(', ')}.`
          : null,
        allDone ? 'Every task in the run is completed.' : null,
      ]
        .filter(Boolean)
        .join('\n\n'),
    );
  }

  function recipients(sessionId: string, to: string) {
    const ownRun = coordinatedRun(sessionId);
    const workerRun = workerTask(sessionId)?.run;
    if (to === COORDINATOR) {
      if (!workerRun) throw new CliError('You are not a worker in any run.');
      return { run: workerRun, sessionIds: [workerRun.coordinatorSessionId] };
    }
    const run = ownRun ?? workerRun;
    if (!run) throw new CliError('You are not part of any run.');
    const live = run.tasks.filter(
      (task) =>
        task.status === 'dispatched' &&
        task.sessionId &&
        task.sessionId !== sessionId,
    );
    const sessions = (tasks: OrchestrationTask[]) => ({
      run,
      sessionIds: tasks.map((task) => task.sessionId!),
    });
    if (to === '@all') return sessions(live);
    if (to === '@idle')
      return sessions(live.filter((task) => !isRunning(task)));
    const agent = AGENT_KINDS.find((kind) => to === `@${kind}`);
    if (agent)
      return sessions(live.filter((task) => taskAgent(task) === agent));
    const task = run.tasks.find((entry) => entry.id === to);
    if (task?.sessionId) return { run, sessionIds: [task.sessionId] };
    const { workspace } = workspaceChat(sessionId);
    const target = linkedWorkspace(workspace, to);
    return { run, sessionIds: [target.sessions[0].id] };
  }

  function isRunning(task: OrchestrationTask) {
    return ctx.runningSessions.has(task.sessionId ?? '');
  }

  function taskAgent(task: OrchestrationTask): AgentKind | null {
    const workspace = ctx.store.state.workspaces.find(
      (entry) => entry.id === task.workspaceId,
    );
    return (
      workspace?.sessions.find((entry) => entry.id === task.sessionId)?.agent ??
      null
    );
  }

  async function runCli(call: CliCall): Promise<CliReply> {
    const [first = 'help', second = ''] = call.argv;
    const pair = `${first} ${second}`;
    const [name, args] = commands[pair]
      ? [pair, call.argv.slice(2)]
      : [first, call.argv.slice(1)];
    const command = commands[name];
    if (!command)
      return failed(`Unknown command "${pair.trim()}". Run \`korev help\`.`);
    try {
      return await command(call, args);
    } catch (error) {
      if (error instanceof CliError) return failed(error.message);
      throw error;
    }
  }

  async function reportUnfinished(
    run: OrchestrationRun,
    task: OrchestrationTask,
    items: ChatItem[],
  ) {
    const result = items.findLast((item) => item.kind === 'result');
    const reply = items.findLast((item) => item.kind === 'assistant');
    const lastReply = reply?.kind === 'assistant' ? reply.text : '(no reply)';
    if (result?.kind === 'result' && result.ok) {
      await wake(
        run,
        korevMessage(
          `worker of ${task.id}`,
          'worker_idle',
          `${task.id} (${task.title}) finished a turn without running korev done. Its last reply:\n\n${lastReply}\n\nAnswer it with \`korev send --to ${task.id} --body "..."\`, or close the task with \`korev task update --id ${task.id} --status completed\`.`,
        ),
      );
      return;
    }
    const reason = result?.kind === 'result' ? result.text : 'It stopped.';
    task.status = 'failed';
    task.result = { outcome: 'failed', summary: reason, files: [] };
    await wake(run, doneMessage(run, task));
  }

  return {
    runCli,
    async turnFinished(sessionId) {
      const found = activeTask(sessionId);
      if (!found) return;
      await reportUnfinished(
        found.run,
        found.task,
        await deps.transcript(sessionId),
      );
    },
    async workspaceArchived(workspaceId) {
      for (const run of runs()) {
        for (const task of run.tasks) {
          if (task.workspaceId !== workspaceId) continue;
          if (task.status !== 'dispatched') continue;
          task.status = 'failed';
          task.result = {
            outcome: 'failed',
            summary: 'Its workspace was archived.',
            files: [],
          };
          await wake(run, doneMessage(run, task));
        }
      }
    },
    async resumeRun(runId) {
      const run = runs().find((entry) => entry.id === runId);
      if (!run) return { ok: false, message: 'Run not found' };
      const held = run.heldMessages;
      Object.assign(run, { paused: false, wakes: 0, heldMessages: [] });
      saveAndEmit();
      if (!held.length) return ok();
      return deps.continueChat(run.coordinatorSessionId, held.join('\n\n'));
    },
  };
}
