import { describe, expect, it } from 'vitest';
import {
  findPrUrls,
  keepReadyPrompt,
  parsePrStack,
  fetchPrs,
  fetchPrStatus,
  parsePrThreads,
  parseReviewStatus,
  parseUnansweredThreads,
  reReviewKey,
  reviewFinished,
  reviewPrompt,
  reviewReplyInstruction,
} from './pull-requests';
import type { CommandRunner } from './command-runner';
import { prProblems, type PrStatus, type PrThread } from '../shared/model';

const PR_URL = 'https://github.com/acme/web/pull/7';

type Node = Record<string, unknown>;

function prNode(fields: Node = {}, checks: Node[] = [], hasNextPage = false) {
  return {
    number: 7,
    url: PR_URL,
    state: 'OPEN',
    commits: {
      nodes: [
        {
          commit: {
            statusCheckRollup: {
              contexts: {
                pageInfo: { hasNextPage, endCursor: hasNextPage ? 'c1' : null },
                nodes: checks,
              },
            },
          },
        },
      ],
    },
    ...fields,
  };
}

const LOOKUP = /(q\d+): (resource\(url|repository\()[^"]*("[^"]*")/g;

function batchRunner(
  answer: (kind: string, value: string, query: string) => unknown,
) {
  const calls: string[] = [];
  const run: CommandRunner = async (_file, args) => {
    const query = args.find((arg) => arg.startsWith('query=')) ?? '';
    calls.push(query);
    const data: Node = { viewer: { login: 'me' } };
    for (const [, alias, kind, value] of query.matchAll(LOOKUP))
      data[alias] = answer(kind, JSON.parse(value) as string, query);
    return {
      exitCode: 0,
      stdout: `HTTP/2.0 200 OK\nX-Ratelimit-Remaining: 4000\n\n${JSON.stringify({ data })}`,
      stderr: '',
    };
  };
  return { run, calls };
}

async function statusOf(node: Node) {
  const { run } = batchRunner(() => node);
  return fetchPrStatus(run, {}, '/repo', PR_URL);
}

describe('PR status', () => {
  it('maps check runs and status contexts to check states', async () => {
    const status = await statusOf(
      prNode({ title: 'Add login', isDraft: false, mergeable: 'CONFLICTING' }, [
        {
          __typename: 'CheckRun',
          name: 'lint',
          status: 'COMPLETED',
          conclusion: 'SUCCESS',
          detailsUrl: 'https://ci/1',
        },
        {
          __typename: 'CheckRun',
          name: 'test',
          status: 'COMPLETED',
          conclusion: 'FAILURE',
          detailsUrl: 'https://ci/2',
        },
        {
          __typename: 'CheckRun',
          name: 'e2e',
          status: 'IN_PROGRESS',
          conclusion: '',
          detailsUrl: '',
        },
        {
          __typename: 'StatusContext',
          context: 'deploy',
          state: 'ERROR',
          targetUrl: 'https://ci/3',
        },
      ]),
    );
    expect(status?.mergeable).toBe('CONFLICTING');
    expect(status?.checks.map((check) => [check.name, check.state])).toEqual([
      ['lint', 'success'],
      ['test', 'failure'],
      ['e2e', 'pending'],
      ['deploy', 'failure'],
    ]);
  });

  it.each([
    ['APPROVED', 'APPROVED'],
    ['', null],
  ])('reads review decision %j as %j', async (reviewDecision, expected) => {
    const status = await statusOf(prNode({ reviewDecision }));
    expect(status?.reviewDecision).toBe(expected);
  });

  it('returns null when there is no PR', async () => {
    expect(await statusOf(null as unknown as Node)).toBeNull();
  });

  it('returns null when gh fails', async () => {
    const run: CommandRunner = async () => ({
      exitCode: 1,
      stdout: '',
      stderr: 'offline',
    });
    expect(await fetchPrStatus(run, {}, '/repo', PR_URL)).toBeNull();
  });
});

describe('batched PR lookups', () => {
  function urlOf(number: number) {
    return `https://github.com/acme/web/pull/${number}`;
  }

  function numberOf(url: string) {
    return Number(url.split('/').pop());
  }

  it('fetches several open PRs with one gh call', async () => {
    const { run, calls } = batchRunner((_kind, url) =>
      prNode({ number: numberOf(url), url }),
    );
    const urls = [1, 2, 3, 4, 5].map(urlOf);

    const { prs } = await fetchPrs(run, {}, '/repo', { urls, branches: [] });

    expect(calls).toHaveLength(1);
    expect([...prs.values()].map((pr) => pr.number)).toEqual([1, 2, 3, 4, 5]);
  });

  it('splits many PRs into requests GitHub answers in time', async () => {
    const { run, calls } = batchRunner((_kind, url) =>
      prNode({ number: numberOf(url), url }),
    );
    const urls = Array.from({ length: 20 }, (_, index) => urlOf(index + 1));

    const { prs } = await fetchPrs(run, {}, '/repo', { urls, branches: [] });

    expect(calls).toHaveLength(3);
    expect(prs.size).toBe(20);
  });

  it('reads the next page of checks for every PR in one more call', async () => {
    const check = (name: string) => ({
      __typename: 'CheckRun',
      name,
      status: 'COMPLETED',
      conclusion: 'SUCCESS',
    });
    const { run, calls } = batchRunner((_kind, url, query) => {
      const number = numberOf(url);
      return query.includes('after: "c1"')
        ? prNode({ number, url }, [check(`late-${number}`)])
        : prNode({ number, url }, [check(`early-${number}`)], true);
    });

    const { prs } = await fetchPrs(run, {}, '/repo', {
      urls: [urlOf(1), urlOf(2)],
      branches: [],
    });

    expect(calls).toHaveLength(2);
    expect(prs.get(urlOf(2))?.checks.map((found) => found.name)).toEqual([
      'early-2',
      'late-2',
    ]);
  });

  it('finds the PR of a branch in the same call and fetches it in full', async () => {
    const branch = { repo: 'acme/web', branch: 'dev/login' };
    const { run, calls } = batchRunner((kind, value) =>
      kind.startsWith('repository')
        ? { pullRequests: { nodes: [{ url: urlOf(9) }] } }
        : prNode({ number: numberOf(value), url: value }),
    );

    const result = await fetchPrs(run, {}, '/repo', {
      urls: [urlOf(1)],
      branches: [branch],
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain('headRefName: "dev/login"');
    expect(result.branchPrs.get(branch)).toBe(urlOf(9));
    expect(result.prs.get(urlOf(9))?.number).toBe(9);
  });

  it('makes no call when there is nothing to look up', async () => {
    const { run, calls } = batchRunner(() => null);

    await fetchPrs(run, {}, '/repo', { urls: [], branches: [] });

    expect(calls).toEqual([]);
  });
});

type StackPr = Record<string, unknown>;
type StackPullRequest = { number: number; url: string; state: string };

function stackPr(number: number, fields: StackPr = {}): StackPr {
  return {
    number,
    url: `https://github.com/acme/web/pull/${number}`,
    state: 'OPEN',
    isDraft: false,
    mergeable: 'MERGEABLE',
    reviewDecision: 'APPROVED',
    commits: {
      nodes: [{ commit: { statusCheckRollup: { state: 'SUCCESS' } } }],
    },
    ...fields,
  };
}

function stackResponse(position: number | null, prs: StackPr[]) {
  return {
    stackEntry: position === null ? null : { position },
    stack:
      position === null
        ? null
        : {
            entries: {
              nodes: prs.map((pullRequest, index) => ({
                position: index + 1,
                pullRequest: pullRequest as unknown as StackPullRequest,
              })),
            },
          },
  };
}

describe('PR stack', () => {
  it('counts only the open PRs below and above this one', () => {
    const json = stackResponse(3, [
      stackPr(5, { state: 'MERGED' }),
      stackPr(6),
      stackPr(7),
      stackPr(8),
    ]);
    expect(parsePrStack(json)).toEqual({
      openBelow: 1,
      openAbove: 1,
      belowReady: true,
    });
  });

  it('marks the PRs below as not ready when one of them is still running checks', () => {
    const json = stackResponse(2, [
      stackPr(5, {
        commits: {
          nodes: [{ commit: { statusCheckRollup: { state: 'PENDING' } } }],
        },
      }),
      stackPr(6),
    ]);
    expect(parsePrStack(json)?.belowReady).toBe(false);
  });

  it('returns null for a PR outside any stack', () => {
    expect(parsePrStack(stackResponse(null, []))).toBeNull();
  });
});

describe('unanswered review threads', () => {
  function thread(
    lastId: string,
    {
      isResolved = false,
      startedBy = { association: 'MEMBER', type: 'User' },
      lastBy = 'reviewer',
    } = {},
  ) {
    return {
      isResolved,
      first: {
        nodes: [
          {
            authorAssociation: startedBy.association,
            author: { __typename: startedBy.type },
          },
        ],
      },
      last: { nodes: [{ id: lastId, author: { login: lastBy } }] },
    };
  }

  function detailsResponse(threads: ReturnType<typeof thread>[]) {
    return { reviewThreads: { nodes: threads } };
  }

  it('lists the last comment of each thread waiting on the author', () => {
    const json = detailsResponse([
      thread('c1'),
      thread('c2', { isResolved: true }),
      thread('c3', { lastBy: 'me' }),
      thread('c4', { startedBy: { association: 'NONE', type: 'User' } }),
      thread('c5', { startedBy: { association: 'NONE', type: 'Bot' } }),
      thread('c6', {
        startedBy: { association: 'COLLABORATOR', type: 'User' },
      }),
    ]);
    expect(parseUnansweredThreads(json, 'me')).toEqual(['c1', 'c5', 'c6']);
  });

  it('returns no threads when the PR has none', () => {
    expect(parseUnansweredThreads({}, 'me')).toEqual([]);
  });
});

describe('required checks', () => {
  it('marks only the checks GitHub reports as required', async () => {
    const status = await statusOf(
      prNode({}, [
        { __typename: 'CheckRun', name: 'test', isRequired: true },
        { __typename: 'CheckRun', name: 'preview', isRequired: false },
        { __typename: 'StatusContext', context: 'deploy' },
      ]),
    );
    expect(status?.checks.map((check) => [check.name, check.required])).toEqual(
      [
        ['test', true],
        ['preview', false],
        ['deploy', true],
      ],
    );
  });

  it('asks GitHub whether each check is required for this PR', async () => {
    const { run, calls } = batchRunner(() => prNode());

    await fetchPrStatus(run, {}, '/repo', PR_URL);

    expect(calls[0]).toContain('isRequired(pullRequestNumber: 7)');
  });
});

function prComment(
  id: string,
  login: string,
  createdAt = '2026-01-01T00:00:00Z',
  type = 'User',
) {
  return {
    id,
    body: `${id} body`,
    url: `https://github.com/x/${id}`,
    createdAt,
    diffHunk: '@@ -1 +1 @@\n+code',
    author: { login, __typename: type },
  };
}

function threadsResponse(resource: Record<string, unknown>): string {
  return JSON.stringify({
    data: {
      resource: {
        reviewThreads: { nodes: [] },
        comments: { nodes: [] },
        reviews: { nodes: [] },
        ...resource,
      },
    },
  });
}

describe('PR threads', () => {
  it('groups replies under their review thread and keeps outdated threads', () => {
    const threads = parsePrThreads(
      threadsResponse({
        reviewThreads: {
          nodes: [
            {
              id: 't1',
              path: 'src/a.ts',
              line: 12,
              isResolved: false,
              isOutdated: false,
              comments: {
                nodes: [prComment('c1', 'ana'), prComment('c2', 'bob')],
              },
            },
            {
              id: 't2',
              path: 'src/b.ts',
              line: null,
              isResolved: true,
              isOutdated: true,
              comments: { nodes: [prComment('c3', 'ana')] },
            },
          ],
        },
      }),
    );
    expect(
      threads.map((thread) => [
        thread.path,
        thread.line,
        thread.isResolved,
        thread.comments.map((comment) => comment.author),
      ]),
    ).toEqual([
      ['src/a.ts', 12, false, ['ana', 'bob']],
      ['src/b.ts', null, true, ['ana']],
    ]);
    expect(threads[0].diffHunk).toBe('@@ -1 +1 @@\n+code');
  });

  it('marks comments from GitHub app bots', () => {
    const threads = parsePrThreads(
      threadsResponse({
        comments: {
          nodes: [
            prComment('c1', 'ana'),
            prComment('c2', 'coderabbitai', undefined, 'Bot'),
          ],
        },
      }),
    );
    expect(threads.map((thread) => thread.comments[0].isBot)).toEqual([
      false,
      true,
    ]);
  });

  it('turns conversation comments and review summaries into file-less threads in time order', () => {
    const threads = parsePrThreads(
      threadsResponse({
        comments: {
          nodes: [prComment('late', 'ana', '2026-01-03T00:00:00Z')],
        },
        reviews: {
          nodes: [
            prComment('early', 'bob', '2026-01-02T00:00:00Z'),
            { ...prComment('empty', 'bob'), body: '' },
          ],
        },
      }),
    );
    expect(threads.map((thread) => [thread.path, thread.id])).toEqual([
      [null, 'early'],
      [null, 'late'],
    ]);
  });

  it('returns no threads when gh output is not JSON', () => {
    expect(parsePrThreads('not json')).toEqual([]);
  });
});

describe('PR links in agent output', () => {
  it('finds each pull request URL once and skips issues', () => {
    const output = [
      'Creating pull request for dev/login into main in acme/web',
      'https://github.com/acme/web/pull/42',
      'See https://github.com/acme/web/pull/42/files and https://github.com/acme/api/pull/7.',
      'Related: https://github.com/acme/web/issues/3',
    ].join('\n');

    expect(findPrUrls(output)).toEqual([
      'https://github.com/acme/web/pull/42',
      'https://github.com/acme/api/pull/7',
    ]);
  });
});

describe('review prompt', () => {
  function pr(number: number, overrides: Partial<PrStatus>): PrStatus {
    return {
      number,
      url: `https://github.com/acme/web/pull/${number}`,
      title: `PR ${number}`,
      state: 'OPEN',
      isDraft: false,
      mergeable: 'MERGEABLE',
      reviewDecision: null,
      mergedAt: null,
      headRefName: `dev/${number}`,
      headRefOid: 'abc123',
      baseRefName: 'main',
      createdAt: '2026-01-01T00:00:00Z',
      checks: [],
      stack: null,
      unansweredThreads: [],
      ...overrides,
    };
  }

  it('names each open PR in a stack with its own base branch', () => {
    const prompt = reviewPrompt([
      pr(9, { headRefName: 'dev/api', baseRefName: 'dev/schema' }),
      pr(8, { headRefName: 'dev/schema', baseRefName: 'main' }),
      pr(5, { state: 'MERGED' }),
    ]);

    expect(prompt).toContain(
      '#8 PR 8 (https://github.com/acme/web/pull/8): dev/schema into main',
    );
    expect(prompt).toContain(
      '#9 PR 9 (https://github.com/acme/web/pull/9): dev/api into dev/schema',
    );
    expect(prompt.indexOf('#8')).toBeLessThan(prompt.indexOf('#9'));
    expect(prompt).not.toContain('pull/5');
  });

  it('reviews the branch against its target when there is no open PR', () => {
    expect(reviewPrompt([])).toContain(
      'Review the changes on this branch compared to its target branch',
    );
  });
});

describe('keep-ready prompt', () => {
  const pr: PrStatus = {
    number: 7,
    url: 'https://github.com/acme/web/pull/7',
    title: '',
    state: 'OPEN',
    isDraft: false,
    mergeable: 'CONFLICTING',
    reviewDecision: null,
    mergedAt: null,
    headRefName: '',
    headRefOid: 'abc123',
    baseRefName: 'main',
    createdAt: '',
    checks: [],
    stack: null,
    unansweredThreads: ['c1', 'c2'],
  };
  const threads: PrThread[] = ['c1', 'c2'].map((id, index) => ({
    id: `t${index + 1}`,
    path: 'README.md',
    line: index + 1,
    diffHunk: '',
    isResolved: false,
    isOutdated: false,
    comments: [
      {
        id,
        author: 'octo',
        isBot: false,
        body: `Please fix ${id}`,
        url: '',
        createdAt: '',
      },
    ],
  }));

  function promptFor(problemKeys: string[], replyInstruction = 'Reply.') {
    return keepReadyPrompt({
      pr,
      problems: prProblems(pr).filter((found) =>
        problemKeys.includes(found.key),
      ),
      threads,
      baseBranch: 'main',
      replyInstruction,
      prompts: { address_review: 'Run make lint first.' },
    });
  }

  it('asks only about the new problems', () => {
    const prompt = promptFor(['thread:c2@7']);
    expect(prompt).toContain('t2 on README.md:2');
    expect(prompt).toContain('> octo: Please fix c2');
    expect(prompt).toContain('Run make lint first.');
    expect(prompt).not.toContain('c1');
    expect(prompt).not.toContain('merge conflicts');
  });

  it('asks to resolve conflicts and answer reviewers in one prompt', () => {
    const prompt = promptFor(
      ['conflict:main@abc123', 'thread:c1@7'],
      'Stay quiet.',
    );
    expect(prompt).toContain('merge conflicts');
    expect(prompt).toContain('Please fix c1');
    expect(prompt).toContain('Stay quiet.');
  });
});

describe('review reply instruction', () => {
  it('uses the custom instruction when one is set', () => {
    expect(
      reviewReplyInstruction({
        reviewReplies: 'custom',
        reviewReplyInstructions: 'Reply only when it needs an explanation.',
      }),
    ).toBe('Reply only when it needs an explanation.');
  });

  it('never posts on GitHub when replies are off', () => {
    expect(
      reviewReplyInstruction({
        reviewReplies: 'none',
        reviewReplyInstructions: 'Reply to everything.',
      }),
    ).toMatch(/do not post/i);
  });
});

describe('review status', () => {
  function reviewResponse({
    state = 'OPEN',
    review = null as { id: string; state: string; oid: string } | null,
    requested = [] as string[],
  } = {}) {
    return JSON.stringify({
      data: {
        viewer: { login: 'me' },
        resource: {
          state,
          headRefOid: 'head1',
          viewerLatestReview: review && {
            id: review.id,
            state: review.state,
            commit: { oid: review.oid },
          },
          reviewRequests: {
            nodes: requested.map((login) => ({
              requestedReviewer: { login },
            })),
          },
        },
      },
    });
  }

  it('reads your latest review and whether you are requested again', () => {
    const status = parseReviewStatus(
      reviewResponse({
        review: { id: 'r1', state: 'CHANGES_REQUESTED', oid: 'old1' },
        requested: ['someone', 'me'],
      }),
    );

    expect(status).toEqual({
      state: 'OPEN',
      headRefOid: 'head1',
      latestReview: { id: 'r1', state: 'CHANGES_REQUESTED', commitOid: 'old1' },
      reRequested: true,
    });
  });

  it('is finished once you approve, or the PR merges or closes', () => {
    const approved = parseReviewStatus(
      reviewResponse({ review: { id: 'r1', state: 'APPROVED', oid: 'h' } }),
    );
    const commented = parseReviewStatus(
      reviewResponse({ review: { id: 'r1', state: 'COMMENTED', oid: 'h' } }),
    );
    const closed = parseReviewStatus(reviewResponse({ state: 'CLOSED' }));

    expect(approved && reviewFinished(approved)).toBe(true);
    expect(commented && reviewFinished(commented)).toBe(false);
    expect(closed && reviewFinished(closed)).toBe(true);
  });

  it('asks for a re-check once per re-request round', () => {
    const changesRequested = {
      review: { id: 'r1', state: 'CHANGES_REQUESTED', oid: 'old1' },
    };
    const reRequested = parseReviewStatus(
      reviewResponse({ ...changesRequested, requested: ['me'] }),
    );
    const notRequested = parseReviewStatus(reviewResponse(changesRequested));
    const approved = parseReviewStatus(
      reviewResponse({
        review: { id: 'r1', state: 'APPROVED', oid: 'old1' },
        requested: ['me'],
      }),
    );

    expect(reRequested && reReviewKey(reRequested)).toBe('r1@head1');
    expect(notRequested && reReviewKey(notRequested)).toBeNull();
    expect(approved && reReviewKey(approved)).toBeNull();
  });

  it('returns null for a response without a pull request', () => {
    expect(parseReviewStatus('{"data":{"resource":null}}')).toBeNull();
  });
});
