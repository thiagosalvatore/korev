import { describe, expect, it } from 'vitest';
import type { CommandRunner } from './command-runner';
import { listPullRequests } from './sources';

function recordingRunner(calls: (readonly string[])[]): CommandRunner {
  return async (_file, args) => {
    calls.push(args);
    return { exitCode: 0, stdout: '[]', stderr: '' };
  };
}

describe('listing pull requests', () => {
  it('asks GitHub to search when there is a query', async () => {
    const calls: (readonly string[])[] = [];
    await listPullRequests(recordingRunner(calls), {}, '/repo', ' 113443 ');
    expect(calls[0]).toEqual(expect.arrayContaining(['--search', '113443']));
  });

  it('lists the newest pull requests without a query', async () => {
    const calls: (readonly string[])[] = [];
    await listPullRequests(recordingRunner(calls), {}, '/repo');
    expect(calls[0]).not.toContain('--search');
  });
});
