import { describe, expect, it } from 'vitest';
import type { CommandResult, CommandRunner } from './command-runner';
import { createGhBackoff } from './gh-backoff';

const OK: CommandResult = { exitCode: 0, stdout: '{}', stderr: '' };
const LIMITED: CommandResult = {
  exitCode: 1,
  stdout: '',
  stderr: 'HTTP 403: You have exceeded a secondary rate limit.',
};

function setup() {
  let now = 0;
  let next = OK;
  const calls: string[] = [];
  const run: CommandRunner = async (file) => {
    calls.push(file);
    return next;
  };
  const backoff = createGhBackoff(run, () => now);
  return {
    backoff,
    calls,
    limit: (limited: boolean) => (next = limited ? LIMITED : OK),
    wait: (ms: number) => (now += ms),
    gh: () => backoff.run('gh', ['api'], { timeoutMs: 1 }),
  };
}

describe('gh rate-limit backoff', () => {
  it('waits a minute, then twice as long each time GitHub limits again', async () => {
    const { backoff, calls, limit, wait, gh } = setup();
    limit(true);
    await gh();

    wait(59_000);
    await gh();
    expect(calls).toHaveLength(1);

    wait(1_000);
    await gh();
    expect(calls).toHaveLength(2);
    wait(119_000);
    expect(backoff.waiting()).toBe(true);
    wait(1_000);
    expect(backoff.waiting()).toBe(false);
  });

  it('still runs other commands while it waits', async () => {
    const { backoff, calls, limit, gh } = setup();
    limit(true);
    await gh();

    await backoff.run('git', ['status'], { timeoutMs: 1 });

    expect(calls).toEqual(['gh', 'git']);
  });

  it('waits until the reset time in the response headers', async () => {
    let now = 0;
    const run: CommandRunner = async () => ({
      exitCode: 1,
      stdout:
        'HTTP/2.0 200 OK\nX-Ratelimit-Remaining: 0\nX-Ratelimit-Reset: 600\n\n{}',
      stderr: 'gh: API rate limit already exceeded for user ID 1.',
    });
    const backoff = createGhBackoff(run, () => now);
    await backoff.run('gh', ['api'], { timeoutMs: 1 });

    now = 599_999;
    expect(backoff.waiting()).toBe(true);
    now = 600_000;
    expect(backoff.waiting()).toBe(false);
  });
});
