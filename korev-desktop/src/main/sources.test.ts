import { describe, expect, it } from 'vitest';
import type { CommandRunner } from './command-runner';
import { listPullRequests, parseInbox } from './sources';

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

function searchedPr(number: number, repo: string, overrides = {}) {
  return {
    number,
    title: `PR ${number}`,
    url: `https://github.com/${repo}/pull/${number}`,
    isDraft: false,
    updatedAt: `2026-11-0${number}T10:00:00Z`,
    headRefName: `feature-${number}`,
    baseRefName: 'main',
    reviewDecision: null,
    mergeable: 'MERGEABLE',
    author: { login: 'octo' },
    repository: { url: `https://github.com/${repo}` },
    commits: {
      nodes: [{ commit: { statusCheckRollup: { state: 'SUCCESS' } } }],
    },
    ...overrides,
  };
}

describe('the pull request inbox', () => {
  const repoIds = new Map([['https://github.com/acme/web', 'web']]);

  it('keeps only pull requests in Korev repos, newest first', () => {
    const json = JSON.stringify({
      data: {
        review: {
          nodes: [
            searchedPr(1, 'acme/web', {
              commits: {
                nodes: [
                  { commit: { statusCheckRollup: { state: 'FAILURE' } } },
                ],
              },
            }),
            searchedPr(2, 'other/elsewhere'),
          ],
        },
        mine: {
          nodes: [
            searchedPr(3, 'Acme/Web', {
              commits: { nodes: [{ commit: { statusCheckRollup: null } }] },
            }),
          ],
        },
      },
    });

    expect(
      parseInbox(json, repoIds).map((pr) => [
        pr.number,
        pr.repoId,
        pr.reason,
        pr.checks,
      ]),
    ).toEqual([
      [3, 'web', 'authored', null],
      [1, 'web', 'review-requested', 'failure'],
    ]);
  });

  it('reads when a pull request was opened and counts only its unresolved threads', () => {
    const json = JSON.stringify({
      data: {
        mine: {
          nodes: [
            searchedPr(1, 'acme/web', {
              createdAt: '2026-10-30T09:00:00Z',
              reviewThreads: {
                nodes: [
                  { isResolved: false },
                  { isResolved: true },
                  { isResolved: false },
                ],
              },
            }),
          ],
        },
      },
    });

    const [pr] = parseInbox(json, repoIds);
    expect([pr.createdAt, pr.unresolvedThreads]).toEqual([
      '2026-10-30T09:00:00Z',
      2,
    ]);
  });

  it('is empty when GitHub does not answer with JSON', () => {
    expect(parseInbox('gh: not logged in', repoIds)).toEqual([]);
  });
});
