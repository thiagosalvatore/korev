import { describe, expect, it, vi } from 'vitest';
import inboxPage from './fixtures/inbox-page.json';
import pageWithoutStacks from './fixtures/inbox-page-without-stacks.json';
import { toPullRequest } from './map-pull-request';
import type { PullRequestNode } from './nodes';

const [stackedNode, failingNode] = inboxPage.data.mine
  .nodes as PullRequestNode[];
const [teamRequestNode] = inboxPage.data.reviews.nodes as PullRequestNode[];
const [noStackFieldNode] = pageWithoutStacks.data.reviews
  .nodes as PullRequestNode[];

function withRollup(
  rollup: PullRequestNode['statusCheckRollup'],
): PullRequestNode {
  return { ...failingNode, statusCheckRollup: rollup };
}

describe('toPullRequest', () => {
  it('maps a stacked PR with its layers ordered from the base branch up', () => {
    const pr = toPullRequest(stackedNode);

    expect(pr).toMatchObject({
      number: 412,
      repo: 'acme/api',
      authorLogin: 'maria',
      isDraft: true,
      mergeStateStatus: 'BLOCKED',
      reviewDecision: 'REVIEW_REQUIRED',
      ci: 'passing',
      unresolvedThreads: 4,
      files: [],
      filesTruncated: false,
    });
    expect(pr.stack).toMatchObject({
      id: 'PRS_kwDOAcmeStack01',
      size: 2,
      baseRefName: 'main',
      position: 2,
    });
    expect(pr.stack?.layers.map((layer) => layer.number)).toEqual([411, 412]);
  });

  it('maps the head branch and whether a fork lets maintainers push', () => {
    const pr = toPullRequest({
      ...failingNode,
      headRefName: 'fix-login',
      baseRefName: 'main',
      headRefOid: 'f00dcafe',
      headRepository: { url: 'https://github.com/forker/api' },
      isCrossRepository: true,
      maintainerCanModify: true,
    });

    expect(pr).toMatchObject({
      headRefName: 'fix-login',
      baseRefName: 'main',
      headRefOid: 'f00dcafe',
      headRepositoryUrl: 'https://github.com/forker/api',
      isCrossRepository: true,
      maintainerCanModify: true,
    });
  });

  it('maps a single PR with failing checks', () => {
    const warn = vi.fn();
    const pr = toPullRequest(failingNode, warn);

    expect(pr.ci).toBe('failing');
    expect(pr.checks).toEqual([
      { name: 'secrets-scan', outcome: 'passing' },
      { name: 'test (api)', outcome: 'failing' },
      { name: 'test (web)', outcome: 'failing' },
    ]);
    expect(pr.stack).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('maps team and user review requests and drops reviewers without a login', () => {
    const pr = toPullRequest(teamRequestNode);

    expect(pr.pendingReviewers).toEqual([
      { kind: 'team', org: 'acme', slug: 'backend' },
      { kind: 'team', org: 'acme', slug: 'platform' },
      { kind: 'user', login: 'maria' },
    ]);
    expect(pr.reviewRequestEvents).toHaveLength(3);
    expect(pr.reviewRequestEvents[0]).toEqual({
      reviewer: { kind: 'team', org: 'acme', slug: 'backend' },
      createdAt: '2026-10-01T23:28:21Z',
    });
    expect(pr.files).toHaveLength(12);
    expect(pr.filesTruncated).toBe(false);
  });

  it('maps checks and the latest review per reviewer, marking bots', () => {
    const pr = toPullRequest(teamRequestNode);

    expect(pr.checks).toEqual([
      { name: 'lint', outcome: 'passing' },
      { name: 'ci/build', outcome: 'passing' },
    ]);
    expect(pr.reviews).toEqual([
      { login: 'pedro', state: 'APPROVED', isBot: false },
      { login: 'ana', state: 'CHANGES_REQUESTED', isBot: false },
      { login: 'stamphog', state: 'APPROVED', isBot: true },
    ]);
  });

  it('maps a node without the stack field to a single PR and warns only once', async () => {
    vi.resetModules();
    const { toPullRequest: freshMapper } = await import('./map-pull-request');
    const warn = vi.fn();

    expect(freshMapper(noStackFieldNode, warn).stack).toBeNull();
    expect(freshMapper(noStackFieldNode, warn).stack).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });

  it('degrades unknown merge states to UNKNOWN', () => {
    const pr = toPullRequest({
      ...failingNode,
      mergeable: 'SOMETHING_NEW',
      mergeStateStatus: 'DRAFT',
    });

    expect(pr.mergeable).toBe('UNKNOWN');
    expect(pr.mergeStateStatus).toBe('UNKNOWN');
  });

  it.each([
    ['SUCCESS', 'passing'],
    ['ERROR', 'failing'],
    ['EXPECTED', 'running'],
  ])('maps a %s rollup to %s CI', (state, expected) => {
    expect(toPullRequest(withRollup({ state })).ci).toBe(expected);
  });

  it('maps a missing rollup to no CI', () => {
    expect(toPullRequest(withRollup(null)).ci).toBe('none');
  });

  it('maps check runs and status contexts to outcomes', () => {
    const contexts = [
      {
        __typename: 'CheckRun',
        name: 'a',
        status: 'IN_PROGRESS',
        conclusion: null,
      },
      {
        __typename: 'CheckRun',
        name: 'b',
        status: 'COMPLETED',
        conclusion: 'CANCELLED',
      },
      {
        __typename: 'CheckRun',
        name: 'c',
        status: 'COMPLETED',
        conclusion: 'NEUTRAL',
      },
      { __typename: 'StatusContext', context: 'd', state: 'PENDING' },
      { __typename: 'StatusContext', context: 'e', state: 'ERROR' },
    ];
    const pr = toPullRequest(
      withRollup({ state: 'PENDING', contexts: { nodes: contexts } }),
    );

    expect(pr.checks.map((check) => check.outcome)).toEqual([
      'pending',
      'failing',
      'skipped',
      'pending',
      'failing',
    ]);
  });

  it('keeps only the newest run of each workflow job, named as GitHub shows it', () => {
    const run = (databaseId: number, event: string, conclusion: string) => ({
      __typename: 'CheckRun',
      name: 'Trunk',
      status: 'COMPLETED',
      conclusion,
      checkSuite: {
        workflowRun: { databaseId, event, workflow: { name: 'Backend CI' } },
      },
    });
    const pr = toPullRequest(
      withRollup({
        state: 'SUCCESS',
        contexts: {
          nodes: [
            run(1, 'pull_request', 'CANCELLED'),
            run(2, 'pull_request', 'SUCCESS'),
            run(3, 'push', 'FAILURE'),
          ],
        },
      }),
    );

    expect(pr.checks).toEqual([
      { name: 'Backend CI / Trunk', outcome: 'passing' },
      { name: 'Backend CI / Trunk', outcome: 'failing' },
    ]);
  });

  it('takes the last activity from creation, the last commit and the newest human comment, ignoring bots', () => {
    const comment = (createdAt: string, typename: string) => ({
      author: { __typename: typename, login: 'someone' },
      body: 'Looks good',
      createdAt,
      url: 'https://github.com/acme/api/pull/1#issuecomment-1',
    });
    const pr = toPullRequest({
      ...failingNode,
      createdAt: '2026-09-01T00:00:00Z',
      commits: {
        nodes: [{ commit: { committedDate: '2026-09-10T00:00:00Z' } }],
      },
      comments: {
        nodes: [
          comment('2026-09-12T00:00:00Z', 'User'),
          comment('2026-09-20T00:00:00Z', 'Bot'),
        ],
      },
    });

    expect(pr.lastActivityAt).toBe('2026-09-12T00:00:00Z');
  });

  it('falls back to the creation time when a node has no commits field', () => {
    const pr = toPullRequest(noStackFieldNode);

    expect(pr.lastActivityAt).toBe(noStackFieldNode.createdAt);
  });
});
