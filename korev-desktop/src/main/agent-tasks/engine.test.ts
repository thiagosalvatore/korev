import { describe, expect, it, vi } from 'vitest';
import { makePr } from '../../inbox/test-fixtures';
import type { AgentTaskState } from '../../shared/agent-tasks';
import type { PrState } from '../../shared/pull-request';
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

function setup(fs = createMemoryFileSystem()) {
  const pending: Pending[] = [];
  const task: AgentTask = {
    run: (run) =>
      new Promise((resolve, reject) => pending.push({ run, resolve, reject })),
  };
  const releaseCheckout = vi.fn(async () => undefined);
  const prState = vi.fn(async (): Promise<PrState | null> => 'OPEN');
  const onSettled = vi.fn();
  const engine = createAgentTasks({
    tasks: { explain: task, 'fix-conflicts': task },
    findPr: (ref) => makePr({ number: Number(ref.split('#')[1]) }),
    prState,
    instructions: () => 'Explain it.',
    store: createTaskStore({ cipher, fs, path: STORE_PATH }),
    login: () => LOGIN,
    releaseCheckout,
    now: () => Date.parse('2026-10-04T10:00:00Z'),
    onChange: () => undefined,
    onSettled,
    warn: () => undefined,
  });
  const settle = async () => {
    await vi.waitFor(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { engine, pending, releaseCheckout, prState, onSettled, fs, settle };
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
      { question: 'Which side wins?', context: 'a.ts', answer: 'Keep ours' },
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
    });
    expect(releaseCheckout).toHaveBeenCalled();
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
