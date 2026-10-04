import { describe, expect, it } from 'vitest';
import type {
  Bucket,
  MyPr,
  MyStack,
  PriorityTier,
  ReviewItem,
  ReviewStack,
} from '../shared/inbox';
import type { StackInfo, StackLayer } from '../shared/pull-request';
import { blocksLayers, groupMyPrs, groupReviews } from './stacks';
import { daysAgo, hoursAgo, makeLayer, makePr } from './test-fixtures';

const DRAFT_SCORE = -1;

const SEVERITY_BY_BUCKET = {
  'needs-you': 'danger',
  'in-progress': 'neutral',
  ready: 'success',
  stale: 'warning',
  kept: 'neutral',
} as const;

function stackOf(layers: StackLayer[], position: number, id = 'S1'): StackInfo {
  return { id, size: layers.length, baseRefName: 'main', position, layers };
}

function fourLayers(states: StackLayer['state'][]): StackLayer[] {
  return states.map((state, index) =>
    makeLayer({ position: index + 1, number: 301 + index, state }),
  );
}

function myPr(
  number: number,
  bucket: Bucket,
  stack: StackInfo | null,
  updatedAt = hoursAgo(1),
  repo = 'acme/web',
): MyPr {
  return {
    pr: makePr({ number, stack, updatedAt, repo }),
    bucket,
    reasons: [
      {
        code: 'checks-failing',
        label: 'Lint failing',
        severity: SEVERITY_BY_BUCKET[bucket],
      },
    ],
    queue: null,
  };
}

function reviewItem(
  number: number,
  score: number,
  stack: StackInfo | null,
  isDraft = false,
  { repo = 'acme/web', tier = 'P2' as PriorityTier } = {},
): ReviewItem {
  return {
    pr: makePr({ number, stack, isDraft, repo }),
    request: {
      requestedAt: daysAgo(1),
      approximate: false,
      direct: true,
      team: null,
    },
    size: { size: 'S', lines: 10, files: 1, filesTruncated: false },
    priority: { tier, score, reasons: [] },
    blocksLayers: 0,
  };
}

const NO_REPO_ORDER: string[] = [];

function numbersIn(
  entries: { kind: string; item?: { pr: { number: number } } }[],
) {
  return entries.map((entry) => entry.item?.pr.number);
}

function onlyStack(sections: ReturnType<typeof groupMyPrs>): MyStack {
  const entry = sections.flatMap((section) => section.entries)[0];
  if (entry.kind !== 'stack') throw new Error('expected a stack');
  return entry.stack;
}

describe('groupMyPrs', () => {
  it('returns the three sections in order with single PRs kept single', () => {
    const sections = groupMyPrs([myPr(1, 'ready', null)], NO_REPO_ORDER);

    expect(sections.map((section) => section.bucket)).toEqual([
      'needs-you',
      'ready',
      'in-progress',
      'stale',
      'kept',
    ]);
    expect(sections[1]).toMatchObject({ count: 1, entries: [{ kind: 'pr' }] });
  });

  it('shows a merged bottom layer as other and does not count it open', () => {
    const layers = fourLayers(['MERGED', 'OPEN', 'OPEN', 'OPEN']);
    const stack = onlyStack(
      groupMyPrs(
        [
          myPr(302, 'in-progress', stackOf(layers, 2)),
          myPr(303, 'in-progress', stackOf(layers, 3)),
          myPr(304, 'in-progress', stackOf(layers, 4)),
        ],
        NO_REPO_ORDER,
      ),
    );

    expect(stack.layers[0]).toMatchObject({ kind: 'other', position: 1 });
    expect(stack.openCount).toBe(3);
  });

  it("keeps a teammate's middle layer as other, bottom-first", () => {
    const layers = fourLayers(['OPEN', 'OPEN', 'OPEN', 'OPEN']);
    const stack = onlyStack(
      groupMyPrs(
        [
          myPr(304, 'ready', stackOf(layers, 4)),
          myPr(301, 'ready', stackOf(layers, 1)),
        ],
        NO_REPO_ORDER,
      ),
    );

    expect(stack.layers.map((layer) => layer.kind)).toEqual([
      'mine',
      'other',
      'other',
      'mine',
    ]);
  });

  it('places a stack in the most urgent bucket of its own layers', () => {
    const layers = fourLayers(['OPEN', 'OPEN', 'OPEN', 'OPEN']);
    const sections = groupMyPrs(
      [
        myPr(301, 'ready', stackOf(layers, 1)),
        myPr(304, 'needs-you', stackOf(layers, 4)),
        myPr(9, 'ready', null),
      ],
      NO_REPO_ORDER,
    );

    expect(sections.map((section) => section.count)).toEqual([2, 1, 0, 0, 0]);
    expect(onlyStack(sections)).toMatchObject({
      bucket: 'needs-you',
      headline: 'Needs you: #304 Lint failing',
    });
  });

  it('marks stacks with more layers than were fetched as partial', () => {
    const layers = fourLayers(['OPEN', 'OPEN', 'OPEN', 'OPEN']);
    const stack = onlyStack(
      groupMyPrs(
        [myPr(301, 'ready', { ...stackOf(layers, 1), size: 25 })],
        NO_REPO_ORDER,
      ),
    );

    expect(stack.partial).toBe(true);
  });

  it('orders a section most severe first, then most recently updated', () => {
    const blocked: MyPr = {
      ...myPr(3, 'in-progress', null, daysAgo(5)),
      reasons: [
        { code: 'blocked-by-rules', label: 'Blocked', severity: 'warning' },
      ],
    };

    const [, , inProgress] = groupMyPrs(
      [
        myPr(1, 'in-progress', null, daysAgo(2)),
        myPr(2, 'in-progress', null, hoursAgo(0)),
        blocked,
      ],
      NO_REPO_ORDER,
    );

    expect(numbersIn(inProgress.entries)).toEqual([3, 2, 1]);
  });

  it('puts every repo in one section, ordered by repo order then severity', () => {
    const blocked: MyPr = {
      ...myPr(3, 'needs-you', null, hoursAgo(0), 'acme/web'),
      reasons: [
        { code: 'blocked-by-rules', label: 'Blocked', severity: 'warning' },
      ],
    };
    const sections = groupMyPrs(
      [
        myPr(1, 'needs-you', null, hoursAgo(0), 'acme/api'),
        blocked,
        myPr(2, 'needs-you', null, daysAgo(3), 'acme/web'),
      ],
      ['acme/web', 'acme/api'],
    );

    expect(sections.filter((section) => section.count > 0)).toHaveLength(1);
    expect(numbersIn(sections[0].entries)).toEqual([2, 3, 1]);
  });

  it('leaves a stack out of Stale while one of its layers is fresh', () => {
    const layers = fourLayers(['OPEN', 'OPEN', 'OPEN', 'OPEN']);
    const sections = groupMyPrs(
      [
        myPr(301, 'stale', stackOf(layers, 1)),
        myPr(302, 'needs-you', stackOf(layers, 2)),
      ],
      NO_REPO_ORDER,
    );

    expect(onlyStack(sections).bucket).toBe('needs-you');
  });

  it('keeps a stack with one layer running and one ready in In progress', () => {
    const layers = fourLayers(['OPEN', 'OPEN', 'OPEN', 'OPEN']);
    const sections = groupMyPrs(
      [
        myPr(301, 'ready', stackOf(layers, 1)),
        myPr(302, 'in-progress', stackOf(layers, 2)),
      ],
      NO_REPO_ORDER,
    );

    expect(onlyStack(sections).bucket).toBe('in-progress');
    expect(
      sections.find((section) => section.bucket === 'in-progress'),
    ).toMatchObject({ count: 2 });
  });
});

describe('blocksLayers', () => {
  it('counts only open layers above the PR', () => {
    const layers = fourLayers(['OPEN', 'OPEN', 'MERGED', 'OPEN']);

    expect(blocksLayers(makePr({ stack: stackOf(layers, 2) }))).toBe(1);
    expect(blocksLayers(makePr({ stack: stackOf(layers, 4) }))).toBe(0);
    expect(blocksLayers(makePr({ stack: null }))).toBe(0);
  });
});

describe('groupReviews', () => {
  it('groups requests in one stack and sorts the group by its best layer', () => {
    const layers = fourLayers(['OPEN', 'OPEN', 'OPEN', 'OPEN']);
    const entries = groupReviews(
      [
        reviewItem(50, 30, null),
        reviewItem(301, 10, stackOf(layers, 1)),
        reviewItem(303, 40, stackOf(layers, 3)),
      ],
      NO_REPO_ORDER,
    );

    expect(entries.map((entry) => entry.kind)).toEqual(['stack', 'pr']);
    const stack = (entries[0] as { stack: ReviewStack }).stack;
    expect(stack.requestedCount).toBe(2);
    expect(stack.layers.map((layer) => layer.kind)).toEqual([
      'requested',
      'other',
      'requested',
      'other',
    ]);
  });

  it('sorts a draft-only stack after ready single PRs', () => {
    const layers = fourLayers(['OPEN', 'OPEN', 'OPEN', 'OPEN']);
    const entries = groupReviews(
      [
        reviewItem(301, DRAFT_SCORE, stackOf(layers, 1), true),
        reviewItem(50, 0, null),
      ],
      NO_REPO_ORDER,
    );

    expect(entries.map((entry) => entry.kind)).toEqual(['pr', 'stack']);
  });

  it('sorts by tier first, then by repo order inside a tier', () => {
    const entries = groupReviews(
      [
        reviewItem(1, 30, null, false, { repo: 'acme/web', tier: 'P2' }),
        reviewItem(2, 60, null, false, { repo: 'acme/api', tier: 'P1' }),
        reviewItem(3, 40, null, false, { repo: 'acme/api', tier: 'P2' }),
      ],
      ['acme/web', 'acme/api'],
    );

    expect(numbersIn(entries)).toEqual([2, 1, 3]);
  });
});
