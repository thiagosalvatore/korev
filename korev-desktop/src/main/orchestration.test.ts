import { describe, expect, it, vi } from 'vitest';
import type {
  ChatItem,
  OrchestrationRun,
  Result,
  Workspace,
} from '../shared/model';
import type { Context } from './context';
import {
  createOrchestration,
  MAX_RUN_DEPTH,
  MAX_WAKES_PER_RUN,
} from './orchestration';
import { defaultSettings } from './store';

const OK: Result = { ok: true, value: undefined };

function workspace(name: string, groupId: string | null): Workspace {
  return {
    id: `${name}-ws`,
    repoId: 'repo',
    groupId,
    name,
    label: null,
    branch: name,
    baseBranch: 'main',
    path: `/work/${name}`,
    port: 0,
    createdAt: '',
    archivedAt: null,
    restoredAt: null,
    archiveSnapshot: null,
    keepAfterMerge: false,
    awaitsLane: false,
    prs: [],
    sessions: [
      {
        id: `${name}-chat`,
        title: name,
        agent: 'claude',
        model: 'claude-model',
        effort: 'high',
        fast: false,
        planMode: false,
        agentSessionId: null,
        forkOnNextTurn: false,
        createdAt: '',
      },
    ],
  };
}

function setup() {
  const state = {
    repos: [{ id: 'repo', name: 'acme' }],
    workspaces: [workspace('lead', null)],
    runs: [] as OrchestrationRun[],
    settings: defaultSettings('/home'),
  };
  const notify = vi.fn();
  let ids = 0;
  const ctx = {
    store: { state, save: () => undefined },
    emitState: () => undefined,
    runningSessions: new Set<string>(),
    deps: { newId: () => `id-${++ids}`, now: () => new Date(0), notify },
    runtime: () => ({ status: 'idle' }),
    workspace: (id: string) => state.workspaces.find((ws) => ws.id === id)!,
  } as unknown as Context;
  const delivered: { sessionId: string; text: string }[] = [];
  const transcript: ChatItem[] = [];
  const firstMessages: string[] = [];
  const orchestration = createOrchestration({
    ctx,
    send: async () => OK,
    continueChat: async (sessionId, text) => {
      delivered.push({ sessionId, text });
      return OK;
    },
    startWorker: (origin, lane, task) => {
      origin.groupId ??= 'group';
      const created = workspace(lane.name, origin.groupId);
      created.sessions[0].agent = task.agent;
      state.workspaces.push(created);
      firstMessages.push(task.text);
      return created;
    },
    stopWorkspace: () => undefined,
    archive: async () => OK,
    transcript: async () => transcript,
  });
  const cli = (sessionId: string, ...argv: string[]) =>
    orchestration.runCli({ sessionId, argv });
  async function startWorker(
    coordinator: string,
    title: string,
    ...extra: string[]
  ) {
    await cli(
      coordinator,
      'task',
      'create',
      '--title',
      title,
      '--spec',
      'do it',
    );
    const run = state.runs.findLast(
      (entry) => entry.coordinatorSessionId === coordinator,
    )!;
    const id = run.tasks.at(-1)!.id;
    const started = await cli(
      coordinator,
      'worker',
      'start',
      '--task',
      id,
      ...extra,
    );
    expect(started.ok).toBe(true);
    return `${title}-chat`;
  }
  return {
    ctx,
    state,
    cli,
    orchestration,
    delivered,
    notify,
    startWorker,
    firstMessages,
  };
}

describe('orchestration', () => {
  it('holds messages after too many and delivers them when the run resumes', async () => {
    const { cli, orchestration, delivered, notify, state, startWorker } =
      setup();
    const worker = await startWorker('lead-chat', 'docs');

    for (let sent = 0; sent <= MAX_WAKES_PER_RUN; sent++)
      await cli(
        worker,
        'send',
        '--to',
        '@coordinator',
        '--body',
        `update ${sent}`,
      );

    expect(delivered).toHaveLength(MAX_WAKES_PER_RUN);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Orchestration paused' }),
    );
    const [run] = state.runs;
    expect(await orchestration.resumeRun(run.id)).toEqual(OK);
    expect(delivered.at(-1)?.text).toContain(`update ${MAX_WAKES_PER_RUN}`);
  });

  it('sends to idle workers and to workers of one agent', async () => {
    const { ctx, cli, delivered, startWorker } = setup();
    const busy = await startWorker('lead-chat', 'busy');
    const idle = await startWorker('lead-chat', 'idle', '--agent', 'codex');
    ctx.runningSessions.add(busy);

    await cli('lead-chat', 'send', '--to', '@idle', '--body', 'hello idle');
    await cli('lead-chat', 'send', '--to', '@codex', '--body', 'hello codex');

    expect(delivered.map((message) => message.sessionId)).toEqual([idle, idle]);
  });

  it(`stops workers from nesting runs more than ${MAX_RUN_DEPTH} levels deep`, async () => {
    const { cli, startWorker } = setup();
    let coordinator = 'lead-chat';
    for (let depth = 0; depth <= MAX_RUN_DEPTH; depth++)
      coordinator = await startWorker(coordinator, `level-${depth}`);

    const nested = await cli(
      coordinator,
      'run',
      'create',
      '--objective',
      'more',
    );

    expect(nested).toMatchObject({ ok: false });
    expect(nested.output).toContain('nest');
  });

  it('fails a running task whose workspace is archived and tells the coordinator', async () => {
    const { orchestration, state, delivered, startWorker } = setup();
    await startWorker('lead-chat', 'docs');

    await orchestration.workspaceArchived('docs-ws');

    expect(state.runs[0].tasks[0].status).toBe('failed');
    expect(delivered).toEqual([
      expect.objectContaining({
        sessionId: 'lead-chat',
        text: expect.stringContaining('Its workspace was archived.'),
      }),
    ]);
  });

  it('only lets a task depend on tasks created before it', async () => {
    const { cli } = setup();
    await cli('lead-chat', 'task', 'create', '--title', 'a', '--spec', 'a');
    await cli(
      'lead-chat',
      'task',
      'create',
      '--title',
      'b',
      '--spec',
      'b',
      '--deps',
      't1',
    );

    const cycle = await cli(
      'lead-chat',
      'task',
      'update',
      '--id',
      't1',
      '--deps',
      't2',
    );

    expect(cycle).toMatchObject({ ok: false });
    expect(cycle.output).toContain('created before it');
  });

  it('answers an unknown flag with an error instead of crashing', async () => {
    const { cli } = setup();

    const reply = await cli('lead-chat', 'task', 'list', '--colour');

    expect(reply).toMatchObject({ ok: false });
    expect(reply.output).toContain('--colour');
  });

  it('passes a worker question to the coordinator and the reply back, without reporting the worker idle', async () => {
    const { cli, orchestration, delivered, startWorker } = setup();
    const worker = await startWorker('lead-chat', 'docs');

    await cli(worker, 'ask', '--question', 'Which API?', '--options', 'v1,v2');
    await orchestration.turnFinished(worker);
    await cli('lead-chat', 'reply', '--id', 'q1', '--body', 'v2');

    expect(delivered).toEqual([
      expect.objectContaining({
        sessionId: 'lead-chat',
        text: expect.stringContaining('q1: Which API?'),
      }),
      expect.objectContaining({
        sessionId: worker,
        text: expect.stringContaining('v2'),
      }),
    ]);
  });

  it('blocks a task behind a gate until the user picks an option', async () => {
    const { cli, orchestration, state, delivered, notify, firstMessages } =
      setup();
    await cli(
      'lead-chat',
      'task',
      'create',
      '--title',
      'db',
      '--spec',
      'migrate',
    );
    await cli(
      'lead-chat',
      'gate',
      'create',
      '--task',
      't1',
      '--question',
      'Drop the old table?',
      '--options',
      'yes,no',
    );
    const [run] = state.runs;

    const blocked = await cli('lead-chat', 'worker', 'start', '--task', 't1');
    const wrongChoice = await orchestration.resolveGate(run.id, 'g1', 'maybe');
    const resolved = await orchestration.resolveGate(run.id, 'g1', 'no');
    const started = await cli('lead-chat', 'worker', 'start', '--task', 't1');

    expect(blocked.output).toContain('decision gate');
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Decision needed' }),
    );
    expect(wrongChoice.ok).toBe(false);
    expect(resolved.ok).toBe(true);
    expect(delivered[0].text).toContain('The user chose: no');
    expect(started.ok).toBe(true);
    expect(firstMessages[0]).toContain('Drop the old table? no');
  });

  it('resumes a task that was interrupted when Korev quit', async () => {
    const { orchestration, state, delivered, startWorker } = setup();
    const worker = await startWorker('lead-chat', 'docs');
    const [run] = state.runs;
    run.tasks[0].status = 'interrupted';

    await orchestration.resumeTask(run.id, 't1');

    expect(run.tasks[0].status).toBe('dispatched');
    expect(delivered).toEqual([expect.objectContaining({ sessionId: worker })]);
  });
});
