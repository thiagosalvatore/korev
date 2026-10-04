import { describe, expect, it } from 'vitest';
import { APPROVED_REVIEW, makeSnapshot } from '../test-fixtures';
import { filterSnapshot } from './filter';

describe('filterSnapshot', () => {
  it("drops other repos' PRs, stacks and approved rows, recounting what is left", () => {
    const avatars = { 'acme/web': 'https://avatars.test/acme.png' };
    const snapshot = makeSnapshot({
      repoAvatars: avatars,
      reviews: { ...makeSnapshot().reviews, approved: [APPROVED_REVIEW] },
    });

    const filtered = filterSnapshot(snapshot, ['acme/api']);

    expect(filtered.mine.map((section) => section.count)).toEqual([1, 1, 1]);
    expect(
      filtered.mine[0].entries.map(
        (entry) => entry.kind === 'pr' && entry.item.pr.repo,
      ),
    ).toEqual(['acme/api']);
    expect(filtered.reviews.entries).toHaveLength(1);
    expect(filtered.reviews.approved).toEqual([]);
    expect(filtered.reviewCount).toBe(1);
    expect(filtered.repoAvatars).toBe(avatars);
  });

  it('returns the snapshot untouched when no repo is chosen', () => {
    const snapshot = makeSnapshot();
    expect(filterSnapshot(snapshot, [])).toBe(snapshot);
  });
});
