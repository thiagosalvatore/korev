import { describe, expect, it } from 'vitest';
import type { Reviewer, StackInfo } from '../shared/pull-request';
import { buildInbox, type InboxInput } from './build-inbox';
import { NOW, daysAgo, makeLayer, makePr } from './test-fixtures';

const viewer = {
  login: 'alice',
  teams: [{ org: 'acme', slug: 'web', members: ['alice', 'bob'] }],
};
const alice: Reviewer = { kind: 'user', login: 'alice' };
const webTeam: Reviewer = { kind: 'team', org: 'acme', slug: 'web' };

function build(input: Partial<InboxInput>) {
  return buildInbox({
    mine: [],
    reviews: [],
    viewer,
    now: NOW,
    unknownMergeStreaks: {},
    repoOrder: [],
    mergeWith: {},
    ...input,
  });
}

function requestedFrom(reviewer: Reviewer) {
  return {
    authorLogin: 'carol',
    pendingReviewers: [reviewer],
    reviewRequestEvents: [{ reviewer, createdAt: daysAgo(2) }],
  };
}

describe('buildInbox', () => {
  it('sorts one section by repo order, with unknown repos last alphabetically', () => {
    const inbox = build({
      mine: [
        makePr({ number: 1, repo: 'acme/zeta' }),
        makePr({ number: 2, repo: 'acme/web' }),
        makePr({ number: 3, repo: 'acme/alpha' }),
        makePr({ number: 4, repo: 'acme/api' }),
      ],
      repoOrder: ['acme/web', 'acme/api'],
    });

    const ready = inbox.mine.find((section) => section.bucket === 'ready');
    expect(
      ready?.entries.map((entry) => entry.kind === 'pr' && entry.item.pr.repo),
    ).toEqual(['acme/web', 'acme/api', 'acme/alpha', 'acme/zeta']);
  });

  it('buckets my PRs into sections in display order', () => {
    const inbox = build({
      mine: [
        makePr({ number: 10, reviewDecision: 'CHANGES_REQUESTED' }),
        makePr({ number: 11 }),
      ],
    });

    expect(inbox.mine.map((section) => section.count)).toEqual([1, 1, 0]);
  });

  it('keeps stacks whole and counts only reviews still waiting on the viewer', () => {
    const layers = [1, 2, 3].map((position) =>
      makeLayer({ position, number: 300 + position }),
    );
    const stackAt = (position: number): StackInfo => ({
      id: 'S1',
      size: 3,
      baseRefName: 'main',
      position,
      layers,
    });
    const inbox = build({
      reviews: [
        makePr({ number: 301, stack: stackAt(1), ...requestedFrom(alice) }),
        makePr({ number: 303, stack: stackAt(3), ...requestedFrom(alice) }),
        makePr({
          number: 40,
          ...requestedFrom(webTeam),
          reviews: [{ login: 'bob', state: 'APPROVED', isBot: false }],
        }),
      ],
    });

    expect(inbox.reviewCount).toBe(2);
    expect(inbox.reviews.entries).toMatchObject([
      { kind: 'stack', stack: { requestedCount: 2, size: 3 } },
    ]);
    expect(inbox.reviews.approved).toMatchObject([
      { item: { pr: { number: 40 } }, approval: { kind: 'teammate' } },
    ]);
  });
});
