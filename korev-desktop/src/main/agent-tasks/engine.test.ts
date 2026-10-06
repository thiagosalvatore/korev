import { describe, expect, it, vi } from 'vitest';
import { makePr } from '../../inbox/test-fixtures';
import {
  AGENT_TASK_KINDS,
  isKeptMergeable,
  type AgentTaskKind,
  type AgentTaskState,
} from '../../shared/agent-tasks';
import type { InboxSnapshot } from '../../shared/inbox';
import type { PrState, PullRequest } from '../../shared/pull-request';
import { emptySnapshot } from '../github/inbox-poller';
import { createMemoryFileSystem } from '../file-system';
import type { SecretCipher } from '../encrypted-file';
import {
  ALREADY_WORKING,
  STOPPED_ON_QUIT,
  createAgentTasks,
  type AgentTask,
  type TaskOutcome,
  type TaskRun,
  UnpushedChangesError,
} from './engine';
import { createTaskStore } from './task-store';

const PREFIX = 'enc:';
const cipher: SecretCipher = {
  isAvailable: async () => true,
  storageBackend: () => 'keychain',
  encrypt: async (plainText) => Buffer.from(PREFIX + plainText),
  decrypt: async (encrypted) => ({
    result: encrypted.toString().slice(PREFIX.length),
    shouldReEncrypt: false,
  }),
};
const STORE_PATH = '/user-data/agent-tasks.bin';
const LOGIN = 'maria';

function refOf(number: number): string {
  return `acme/web#${number}`;
}

interface Pending {
  run: TaskRun;
  resolve(outcome: TaskOutcome): void;
  reject(error: Error): void;
}

function setup(
  fs = createMemoryFileSystem(),
  isWatched: (ref: string) => boolean = () => false,
) {
  const pending: Pending[] = [];
  const task: AgentTask = {
    run: (run) =>
      new Promise((resolve, reject) => pending.push({ run, resolve, reject })),
  };
  const releaseCheckout = vi.fn(async () => undefined);
  const prState = vi.fn(async (): Promise<PrState | null> => 'OPEN');
  const onSettled = vi.fn();
  const onActivity = vi.fn();
  const engine = createAgentTasks({
    tasks: Object.fromEntries(
      AGENT_TASK_KINDS.map((kind) => [kind, task]),
    ) as Record<AgentTaskKind, AgentTask>,
    findPr: (ref) => makePr({ number: Number(ref.split('#')[1]) }),
    prState,
    isWatched,
    instructions: () => 'Explain it.',
    store: createTaskStore({ cipher, fs, path: STORE_PATH }),
    login: () => LOGIN,
    releaseCheckout,
    now: () => Date.parse('2026-10-04T10:00:00Z'),
    onChange: () => undefined,
    onSettled,
    onActivity,
    warn: () => undefined,
  });
  const settle = async () => {
    await vi.waitFor(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return {
    engine,
    pending,
    releaseCheckout,
    prState,
    onSettled,
    onActivity,
    fs,
    settle,
  };
}

const DONE: TaskOutcome = { status: 'done', summary: 'Explained', commits: [] };
const QUESTION = { id: 'q1', question: 'Which side wins?', context: 'a.ts' };

function stateOf(
  engine: ReturnType<typeof setup>['engine'],
  number: number,
): AgentTaskState | undefined {
  return engine.state()[refOf(number)];
}

describe('agent tasks engine', () => {
  it('runs a task, shows it done and removes its checkout', async () => {
    const { engine, pending, releaseCheckout, settle } = setup();

    expect(engine.start(refOf(1), 'explain')).toEqual({ ok: true });
    expect(stateOf(engine, 1)).toMatchObject({ status: 'running' });
    pending[0].resolve(DONE);
    await settle();

    expect(stateOf(engine, 1)).toMatchObject({
      status: 'done',
      summary: 'Explained',
    });
    expect(releaseCheckout).toHaveBeenCalledWith(refOf(1));
  });

  it('passes on what the agent does and keeps it until the next run starts', async () => {
    const { engine, pending, onActivity, settle } = setup();
    engine.start(refOf(1), 'review');
    await settle();

    pending[0].run.activity({ kind: 'step', text: 'Read a.ts' });
    pending[0].resolve(DONE);
    await settle();

    const entry = {
      at: '2026-10-04T10:00:00.000Z',
      kind: 'step',
      text: 'Read a.ts',
    };
    expect(onActivity).toHaveBeenCalledWith({ ref: refOf(1), entry });
    expect(engine.activity(refOf(1))).toEqual([entry]);

    engine.start(refOf(1), 'review');
    expect(engine.activity(refOf(1))).toEqual([]);
  });

  it('remembers the last five runs on a PR, newest first', async () => {
    const { engine, pending, settle } = setup();
    for (let run = 1; run <= 6; run += 1) {
      engine.start(refOf(1), 'explain');
      pending[run - 1].resolve({ ...DONE, summary: `Run ${run}` });
      await settle();
    }

    expect(engine.history()[refOf(1)].map((entry) => entry.summary)).toEqual([
      'Run 6',
      'Run 5',
      'Run 4',
      'Run 3',
      'Run 2',
    ]);
  });

  it('runs two tasks at once and queues the third', async () => {
    const { engine, pending, settle } = setup();
    engine.start(refOf(1), 'explain');
    engine.start(refOf(2), 'explain');
    engine.start(refOf(3), 'explain');
    await settle();

    expect(pending).toHaveLength(2);
    expect(stateOf(engine, 3)).toMatchObject({ step: 'queued' });

    pending[0].resolve(DONE);
    await settle();

    expect(pending).toHaveLength(3);
    expect(pending[2].run.pr.number).toBe(3);
  });

  it('refuses a second task on a PR that already has one running', () => {
    const { engine } = setup();
    engine.start(refOf(1), 'explain');

    expect(engine.start(refOf(1), 'explain')).toEqual({
      ok: false,
      message: ALREADY_WORKING,
    });
  });

  it('keeps the checkout while waiting for answers, then re-runs with them', async () => {
    const { engine, pending, releaseCheckout, onSettled, settle } = setup();
    engine.start(refOf(1), 'explain');
    pending[0].resolve({ status: 'needs-input', questions: [QUESTION] });
    await settle();

    expect(stateOf(engine, 1)).toMatchObject({ status: 'needs-input' });
    expect(onSettled).toHaveBeenCalledWith(
      refOf(1),
      expect.objectContaining({ status: 'needs-input' }),
    );
    expect(releaseCheckout).not.toHaveBeenCalled();
    expect(engine.keptRefs()).toEqual([refOf(1)]);
    expect(engine.answer(refOf(1), { q1: ' ' })).toMatchObject({ ok: false });

    expect(engine.answer(refOf(1), { q1: 'Keep ours' })).toEqual({ ok: true });
    await settle();

    expect(pending[1].run.answered).toEqual([
      {
        id: 'q1',
        question: 'Which side wins?',
        context: 'a.ts',
        answer: 'Keep ours',
      },
    ]);
  });

  it('shows why a task failed and removes its checkout', async () => {
    const { engine, pending, releaseCheckout, settle } = setup();
    engine.start(refOf(1), 'explain');
    pending[0].reject(new Error('Stopped after 10 minutes'));
    await settle();

    expect(stateOf(engine, 1)).toEqual({
      status: 'failed',
      kind: 'explain',
      message: 'Stopped after 10 minutes',
      headRefOid: makePr().headRefOid,
    });
    expect(releaseCheckout).toHaveBeenCalled();
  });

  it('keeps the checkout of a commit Korev could not push until the failure is dismissed', async () => {
    const { engine, pending, releaseCheckout, settle } = setup();
    engine.start(refOf(1), 'fix-ci');
    pending[0].reject(
      new UnpushedChangesError('Push it from your terminal.', 'h2'),
    );
    await settle();

    expect(stateOf(engine, 1)).toEqual({
      status: 'failed',
      kind: 'fix-ci',
      message: 'Push it from your terminal.',
      unpushed: 'h2',
    });
    expect(releaseCheckout).not.toHaveBeenCalled();
    expect(engine.keptRefs()).toEqual([refOf(1)]);

    await engine.dismiss(refOf(1));

    expect(releaseCheckout).toHaveBeenCalledWith(refOf(1));
  });

  it('brings back waiting questions after a restart and fails the run that was in flight', async () => {
    const fs = createMemoryFileSystem();
    const first = setup(fs);
    first.engine.start(refOf(1), 'explain');
    first.engine.start(refOf(2), 'explain');
    first.pending[0].resolve({ status: 'needs-input', questions: [QUESTION] });
    await first.settle();
    first.engine.stop();
    await first.settle();

    expect(fs.files.get(STORE_PATH)?.toString().startsWith(PREFIX)).toBe(true);

    const second = setup(fs);
    await second.engine.restore(LOGIN);

    expect(stateOf(second.engine, 1)).toMatchObject({
      status: 'needs-input',
      questions: [QUESTION],
    });
    expect(stateOf(second.engine, 2)).toMatchObject({
      status: 'failed',
      message: STOPPED_ON_QUIT,
    });
  });

  it("restores nothing for another account's records", async () => {
    const fs = createMemoryFileSystem();
    const first = setup(fs);
    first.engine.start(refOf(1), 'explain');
    await first.settle();

    const second = setup(fs);
    await second.engine.restore('octocat');

    expect(second.engine.state()).toEqual({});
  });

  it('removes a waiting task and its checkout once the PR is merged', async () => {
    const { engine, pending, releaseCheckout, prState, settle } = setup();
    engine.start(refOf(1), 'explain');
    pending[0].resolve({ status: 'needs-input', questions: [QUESTION] });
    await settle();
    prState.mockResolvedValueOnce('MERGED');

    engine.reconcile({ ...emptySnapshot(1), status: 'live' });
    await settle();

    expect(engine.state()).toEqual({});
    expect(releaseCheckout).toHaveBeenCalledWith(refOf(1));
  });

  it('keeps a waiting task whose PR is still open but left the inbox', async () => {
    const { engine, pending, settle } = setup();
    engine.start(refOf(1), 'explain');
    pending[0].resolve({ status: 'needs-input', questions: [QUESTION] });
    await settle();

    engine.reconcile({ ...emptySnapshot(1), status: 'live' });
    await settle();

    expect(stateOf(engine, 1)).toMatchObject({ status: 'needs-input' });
  });

  it('forgets every record when cleared', async () => {
    const { engine, fs, settle } = setup();
    engine.start(refOf(1), 'explain');
    await settle();

    await engine.clear();

    expect(engine.state()).toEqual({});
    expect(fs.files.has(STORE_PATH)).toBe(false);
  });
});

const WATCH_ALL = () => true;

function mineSnapshot(...prs: PullRequest[]): InboxSnapshot {
  return {
    ...emptySnapshot(1),
    status: 'live',
    mine: [
      {
        bucket: 'needs-you',
        count: prs.length,
        entries: prs.map((pr) => ({
          kind: 'pr' as const,
          item: { pr, bucket: 'needs-you' as const, reasons: [], queue: null },
        })),
      },
    ],
  };
}

function watchedPr(overrides: Partial<PullRequest>): PullRequest {
  return makePr({ number: 1, headRefOid: 'h1', ...overrides });
}

const FAILING_CI: Partial<PullRequest> = {
  ci: 'failing',
  checks: [{ name: 'lint', outcome: 'failing' }],
};

describe('keep mergeable', () => {
  it('does not re-run a PR while it holds a commit Korev could not push', async () => {
    const { engine, pending, settle } = setup(undefined, WATCH_ALL);
    const conflicted = mineSnapshot(watchedPr({ mergeable: 'CONFLICTING' }));
    engine.reconcile(conflicted);
    pending[0].reject(
      new UnpushedChangesError('Push it from your terminal.', 'h2'),
    );
    await settle();

    engine.reconcile(conflicted);
    await settle();

    expect(pending).toHaveLength(1);
    expect(stateOf(engine, 1)).toMatchObject({ unpushed: 'h2' });
  });

  it('clears the failure once the PR head is the commit Korev could not push', async () => {
    const { engine, pending, releaseCheckout, settle } = setup(
      undefined,
      WATCH_ALL,
    );
    engine.reconcile(mineSnapshot(watchedPr({ mergeable: 'CONFLICTING' })));
    pending[0].reject(
      new UnpushedChangesError('Push it from your terminal.', 'h2'),
    );
    await settle();

    engine.reconcile(mineSnapshot(watchedPr({ headRefOid: 'h2' })));
    await settle();

    expect(stateOf(engine, 1)).toBeUndefined();
    expect(releaseCheckout).toHaveBeenCalledWith(refOf(1));
  });

  it('clears a failed run once the PR gets a new commit', async () => {
    const { engine, pending, settle } = setup();
    engine.start(refOf(1), 'fix-ci');
    pending[0].reject(new Error('The agent stopped.'));
    await settle();

    engine.reconcile(mineSnapshot(makePr({ number: 1 })));
    await settle();
    expect(stateOf(engine, 1)).toMatchObject({ status: 'failed' });

    engine.reconcile(mineSnapshot(makePr({ number: 1, headRefOid: 'h2' })));
    await settle();
    expect(stateOf(engine, 1)).toBeUndefined();
  });

  it('fixes the conflict first, then failing CI on a later snapshot', async () => {
    const { engine, pending, settle } = setup(undefined, WATCH_ALL);

    engine.reconcile(mineSnapshot(watchedPr({ mergeable: 'CONFLICTING' })));
    expect(stateOf(engine, 1)).toMatchObject({ kind: 'fix-conflicts' });
    pending[0].resolve(DONE);
    await settle();

    engine.reconcile(
      mineSnapshot(watchedPr({ headRefOid: 'h2', ...FAILING_CI })),
    );

    expect(stateOf(engine, 1)).toMatchObject({
      status: 'running',
      kind: 'fix-ci',
    });
  });

  it('asks once, with the questions from two steps together', async () => {
    const { engine, pending, onSettled, settle } = setup(undefined, WATCH_ALL);
    const pr = watchedPr({ ...FAILING_CI, unresolvedThreads: 2 });

    engine.reconcile(mineSnapshot(pr));
    pending[0].resolve({ status: 'needs-input', questions: [QUESTION] });
    await settle();
    expect(stateOf(engine, 1)).not.toMatchObject({ status: 'needs-input' });

    engine.reconcile(mineSnapshot(pr));
    expect(stateOf(engine, 1)).toMatchObject({ kind: 'address-comments' });
    const second = { id: 'q2', question: 'Rename it?', context: 'cache.ts' };
    pending[1].resolve({ status: 'needs-input', questions: [second] });
    await settle();

    engine.reconcile(mineSnapshot(pr));

    expect(stateOf(engine, 1)).toMatchObject({
      status: 'needs-input',
      questions: [QUESTION, second],
    });
    const asked = onSettled.mock.calls.filter(
      ([, state]) => state.status === 'needs-input',
    );
    expect(asked).toHaveLength(1);
  });

  it('does not ask while checks are still running', async () => {
    const { engine, pending, settle } = setup(undefined, WATCH_ALL);
    engine.reconcile(mineSnapshot(watchedPr({ unresolvedThreads: 1 })));
    pending[0].resolve({ status: 'needs-input', questions: [QUESTION] });
    await settle();

    engine.reconcile(
      mineSnapshot(
        watchedPr({
          unresolvedThreads: 1,
          ci: 'running',
          checks: [{ name: 'test', outcome: 'pending' }],
        }),
      ),
    );

    expect(stateOf(engine, 1)).not.toMatchObject({ status: 'needs-input' });
  });

  it('stops after two attempts at the same step and asks what to try next', async () => {
    const { engine, pending, settle } = setup(undefined, WATCH_ALL);

    engine.reconcile(
      mineSnapshot(watchedPr({ headRefOid: 'h1', ...FAILING_CI })),
    );
    pending[0].resolve({ status: 'done', summary: 'Fixed', commits: ['h2'] });
    await settle();
    engine.reconcile(
      mineSnapshot(watchedPr({ headRefOid: 'h2', ...FAILING_CI })),
    );
    pending[1].resolve({ status: 'done', summary: 'Fixed', commits: ['h3'] });
    await settle();

    engine.reconcile(
      mineSnapshot(watchedPr({ headRefOid: 'h3', ...FAILING_CI })),
    );

    expect(pending).toHaveLength(2);
    expect(stateOf(engine, 1)).toMatchObject({
      status: 'needs-input',
      questions: [{ id: 'gave-up:fix-ci' }],
    });
  });

  it('counts re-runs of the same failing checks toward the two attempts', async () => {
    const { engine, pending, settle } = setup(undefined, WATCH_ALL);
    const failing = mineSnapshot(watchedPr(FAILING_CI));
    const rerunning = mineSnapshot(
      watchedPr({
        ci: 'running',
        checks: [{ name: 'lint', outcome: 'pending' }],
      }),
    );

    for (const attempt of [0, 1]) {
      engine.reconcile(failing);
      pending[attempt].resolve({
        status: 'done',
        summary: 'Re-ran',
        commits: [],
      });
      await settle();
      engine.reconcile(rerunning);
    }
    engine.reconcile(failing);

    expect(pending).toHaveLength(2);
    expect(stateOf(engine, 1)).toMatchObject({
      status: 'needs-input',
      questions: [{ id: 'gave-up:fix-ci' }],
    });
  });

  it('watches every PR of mine when "all" is on, except one turned off', () => {
    const settings = { allMine: true, prs: { [refOf(2)]: false } };
    const { engine } = setup(undefined, (ref) =>
      isKeptMergeable(settings, ref),
    );

    engine.reconcile(
      mineSnapshot(
        watchedPr({ number: 1, mergeable: 'CONFLICTING' }),
        watchedPr({ number: 2, mergeable: 'CONFLICTING' }),
      ),
    );

    expect(stateOf(engine, 1)).toMatchObject({ status: 'running' });
    expect(stateOf(engine, 2)).toBeUndefined();
  });

  it('leaves a PR alone while it sits in a merge queue', () => {
    const { engine } = setup(undefined, WATCH_ALL);
    const snapshot = mineSnapshot(watchedPr({ mergeable: 'CONFLICTING' }));
    const [entry] = snapshot.mine[0].entries;
    if (entry.kind === 'pr') {
      entry.item.queue = {
        kind: 'queued',
        tool: 'github',
        by: null,
        at: null,
        url: null,
      };
    }

    engine.reconcile(snapshot);

    expect(engine.state()).toEqual({});
  });
});
