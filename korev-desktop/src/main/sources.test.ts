import { describe, expect, it } from 'vitest';
import type { CommandRunner } from './command-runner';
import { listInbox, listPullRequests, parseInbox } from './sources';

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
      parseInbox([json], repoIds).map((pr) => [
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

    const [pr] = parseInbox([json], repoIds);
    expect([pr.createdAt, pr.unresolvedThreads]).toEqual([
      '2026-10-30T09:00:00Z',
      2,
    ]);
  });

  it('is empty when GitHub does not answer with JSON', () => {
    expect(parseInbox(['gh: not logged in'], repoIds)).toEqual([]);
  });

  function inboxRunner(
    queries: string[],
    answer: (query: string) => {
      exitCode: number;
      stdout: string;
      stderr: string;
    },
  ): CommandRunner {
    return async (_file, args) => {
      const query = args[args.length - 1];
      queries.push(query);
      return answer(query);
    };
  }

  function searchResponse(alias: string, prs: unknown[]) {
    return JSON.stringify({ data: { [alias]: { nodes: prs } } });
  }

  it('asks GitHub for each search in its own request and merges them, newest first', async () => {
    const queries: string[] = [];
    const runner = inboxRunner(queries, (query) => ({
      exitCode: 0,
      stdout: query.includes('review-requested:@me')
        ? searchResponse('review', [searchedPr(1, 'acme/web')])
        : searchResponse('mine', [searchedPr(2, 'acme/web')]),
      stderr: '',
    }));

    const inbox = await listInbox(runner, {}, '/home', repoIds);

    expect(queries.map((query) => query.match(/search\(/g)?.length)).toEqual([
      1, 1,
    ]);
    expect(inbox.ok && inbox.value.map((pr) => [pr.number, pr.reason])).toEqual(
      [
        [2, 'authored'],
        [1, 'review-requested'],
      ],
    );
  });

  it('fails with what GitHub said when one of the searches fails', async () => {
    const runner = inboxRunner([], (query) =>
      query.includes('author:@me')
        ? { exitCode: 1, stdout: '', stderr: 'gh: HTTP 504\n' }
        : { exitCode: 0, stdout: searchResponse('review', []), stderr: '' },
    );

    expect(await listInbox(runner, {}, '/home', repoIds)).toEqual({
      ok: false,
      message: 'gh: HTTP 504',
    });
  });
});
