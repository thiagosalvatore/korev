import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makePr } from '../../inbox/test-fixtures';
import { runProcess } from '../agents/command-runner';
import { createCheckouts } from '../checkouts';
import { createGitRemote, type GitRemote } from '../test-git-remote';
import type { TaskOutcome } from './engine';
import { createFixConflictsTask, fixConflictsPrompt } from './fix-conflicts';
import type { RunAgent } from './run-agent';

const REPO = 'acme/api';
const NUMBER = 12;
const PR = makePr({
  number: NUMBER,
  repo: REPO,
  title: 'Raise the ingest limit',
  headRefName: 'raise-limit',
  baseRefName: 'main',
});
const QUESTION = {
  id: 'q1',
  question: 'Which limit wins?',
  context: 'config.ts: 20 (PR) or 30 (main)',
};

let scratch: string;
let remote: GitRemote;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'korev-fix-conflicts-'));
  remote = createGitRemote(
    scratch,
    REPO,
    { 'config.ts': 'export const limit = 10;\n', 'README.md': 'api\n' },
    [
      {
        number: NUMBER,
        headRefName: 'raise-limit',
        files: { 'config.ts': 'export const limit = 20;\n' },
      },
    ],
  );
});

afterEach(() => rmSync(scratch, { recursive: true, force: true }));

function agentReply(
  edit: (cwd: string) => void,
  questions: (typeof QUESTION)[] = [],
): RunAgent {
  return vi.fn(async ({ cwd }) => {
    edit(cwd);
    return {
      ok: true as const,
      output: JSON.stringify({
        summary: 'Kept both limits as 25',
        changed: questions.length === 0,
        commitMessage: null,
        questions,
      }),
    };
  });
}

function resolveTo25(cwd: string) {
  writeFileSync(join(cwd, 'config.ts'), 'export const limit = 25;\n');
}

function run(runAgent: RunAgent) {
  const checkouts = createCheckouts({
    run: runProcess,
    env: { ...process.env, HOME: remote.home, GIT_CONFIG_NOSYSTEM: '1' },
    root: join(scratch, 'user-data'),
    gitUrl: remote.gitUrl,
    token: () => null,
    now: () => Date.now(),
  });
  const task = createFixConflictsTask({
    checkouts,
    runAgent,
    canPushWorkflows: async () => false,
  });
  return task.run({
    ref: `${REPO}#${NUMBER}`,
    pr: PR,
    instructions: 'Resolve them.',
    answered: [],
    signal: new AbortController().signal,
    step: () => undefined,
  });
}

function originHead(): string {
  return remote.git('rev-parse', 'raise-limit');
}

describe('fix conflicts task', () => {
  it('builds the same prompt for the fixture PR', async () => {
    const prompt = fixConflictsPrompt({
      pr: PR,
      files: ['config.ts'],
      diff: '<<<<<<< HEAD\n20\n=======\n30\n>>>>>>> origin/main',
      instructions: 'Resolve them.',
      answered: [],
    });

    await expect(prompt).toMatchFileSnapshot('golden/fix-conflicts.prompt.txt');
  });

  it('merges the base, lets the agent resolve the markers and pushes a merge commit', async () => {
    remote.commit(
      'main',
      { 'config.ts': 'export const limit = 30;\n' },
      'Raise on main',
    );
    const runAgent = agentReply(resolveTo25);

    const outcome = await run(runAgent);

    expect(outcome).toMatchObject({ status: 'done', commits: [originHead()] });
    expect(remote.git('log', '-1', '--format=%P %s', 'raise-limit')).toMatch(
      /^\w+ \w+ Merge main into raise-limit$/,
    );
    expect(remote.git('show', 'raise-limit:config.ts')).toBe(
      'export const limit = 25;',
    );
    expect(runAgent).toHaveBeenCalledWith(
      expect.objectContaining({ access: 'edit' }),
    );
  });

  it('pushes nothing when conflict markers are left behind', async () => {
    remote.commit(
      'main',
      { 'config.ts': 'export const limit = 30;\n' },
      'Raise on main',
    );
    const before = originHead();

    await expect(run(agentReply(() => undefined))).rejects.toThrow(
      'Conflict markers are still in config.ts',
    );
    expect(originHead()).toBe(before);
  });

  it('asks instead of pushing, then finishes the same merge with the answer', async () => {
    remote.commit(
      'main',
      { 'config.ts': 'export const limit = 30;\n' },
      'Raise on main',
    );
    const before = originHead();

    const asked: TaskOutcome = await run(
      agentReply(() => undefined, [QUESTION]),
    );

    expect(asked).toEqual({ status: 'needs-input', questions: [QUESTION] });
    expect(originHead()).toBe(before);

    const answered = await run(agentReply(resolveTo25));
    expect(answered).toMatchObject({ status: 'done' });
    expect(remote.git('show', 'raise-limit:config.ts')).toBe(
      'export const limit = 25;',
    );
  });

  it('pushes a clean merge without running the agent', async () => {
    remote.commit('main', { 'README.md': 'api docs\n' }, 'Docs on main');
    const runAgent = agentReply(resolveTo25);

    const outcome = await run(runAgent);

    expect(outcome).toMatchObject({ status: 'done', commits: [originHead()] });
    expect(runAgent).not.toHaveBeenCalled();
  });
});
