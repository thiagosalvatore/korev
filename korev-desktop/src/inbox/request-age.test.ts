import { describe, expect, it } from 'vitest';
import type { Reviewer } from '../shared/pull-request';
import { reviewRequestFor, type Viewer } from './request-age';
import { daysAgo, hoursAgo, makePr } from './test-fixtures';

const ALICE: Viewer = {
  login: 'alice',
  teams: [{ org: 'acme', slug: 'frontend', members: ['alice'] }],
};
const aliceUser: Reviewer = { kind: 'user', login: 'alice' };
const bobUser: Reviewer = { kind: 'user', login: 'bob' };
const frontendTeam: Reviewer = { kind: 'team', org: 'acme', slug: 'frontend' };

describe('reviewRequestFor', () => {
  it("ignores other reviewers' request events", () => {
    const pr = makePr({
      pendingReviewers: [aliceUser, bobUser],
      reviewRequestEvents: [
        { reviewer: aliceUser, createdAt: daysAgo(7) },
        { reviewer: bobUser, createdAt: hoursAgo(1) },
      ],
    });

    expect(reviewRequestFor(pr, ALICE)).toEqual({
      requestedAt: daysAgo(7),
      approximate: false,
      direct: true,
      team: null,
    });
  });

  it('marks a request through one of the viewer teams', () => {
    const pr = makePr({
      pendingReviewers: [frontendTeam],
      reviewRequestEvents: [{ reviewer: frontendTeam, createdAt: daysAgo(2) }],
    });

    expect(reviewRequestFor(pr, ALICE)).toMatchObject({
      requestedAt: daysAgo(2),
      direct: false,
      team: '@acme/frontend',
    });
  });

  it('prefers a direct request over a newer team request', () => {
    const pr = makePr({
      pendingReviewers: [aliceUser, frontendTeam],
      reviewRequestEvents: [
        { reviewer: aliceUser, createdAt: daysAgo(3) },
        { reviewer: frontendTeam, createdAt: hoursAgo(2) },
      ],
    });

    expect(reviewRequestFor(pr, ALICE)).toMatchObject({
      requestedAt: daysAgo(3),
      direct: true,
    });
  });

  it('resets the age when the viewer is re-requested', () => {
    const pr = makePr({
      pendingReviewers: [aliceUser],
      reviewRequestEvents: [
        { reviewer: aliceUser, createdAt: daysAgo(5) },
        { reviewer: aliceUser, createdAt: hoursAgo(3) },
      ],
    });

    expect(reviewRequestFor(pr, ALICE).requestedAt).toBe(hoursAgo(3));
  });

  it('falls back to the PR open time when no event matches', () => {
    const pr = makePr({
      createdAt: daysAgo(4),
      pendingReviewers: [aliceUser],
      reviewRequestEvents: [{ reviewer: bobUser, createdAt: hoursAgo(1) }],
    });

    expect(reviewRequestFor(pr, ALICE)).toEqual({
      requestedAt: daysAgo(4),
      approximate: true,
      direct: true,
      team: null,
    });
  });

  it('uses a pending team request when the viewer teams are unknown', () => {
    const pr = makePr({
      createdAt: daysAgo(4),
      pendingReviewers: [frontendTeam],
      reviewRequestEvents: [{ reviewer: frontendTeam, createdAt: daysAgo(2) }],
    });

    expect(reviewRequestFor(pr, { login: 'alice', teams: [] })).toEqual({
      requestedAt: daysAgo(2),
      approximate: false,
      direct: false,
      team: '@acme/frontend',
    });
  });

  it('ignores team requests that are no longer pending', () => {
    const pr = makePr({
      createdAt: daysAgo(4),
      pendingReviewers: [aliceUser],
      reviewRequestEvents: [{ reviewer: frontendTeam, createdAt: daysAgo(2) }],
    });

    expect(reviewRequestFor(pr, { login: 'alice', teams: [] })).toMatchObject({
      requestedAt: daysAgo(4),
      approximate: true,
    });
  });
});
