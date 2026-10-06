import { describe, expect, it } from 'vitest';
import type { Check } from '../shared/pull-request';
import { classifyMyPr } from './classify';
import { NOW, daysAgo, makePr } from './test-fixtures';

function codesOf(result: ReturnType<typeof classifyMyPr>) {
  return result.reasons.map((reason) => reason.code);
}

function checks(outcomes: Check['outcome'][]): Check[] {
  return outcomes.map((outcome, index) => ({
    name: `check-${index}`,
    outcome,
  }));
}

describe('classifyMyPr merge states', () => {
  it.each([
    ['CLEAN', 'ready', 'ready-to-merge'],
    ['HAS_HOOKS', 'ready', 'ready-to-merge'],
    ['BEHIND', 'needs-you', 'behind'],
    ['DIRTY', 'needs-you', 'conflicts'],
    ['UNKNOWN', 'in-progress', 'checking-mergeability'],
    ['BLOCKED', 'in-progress', 'blocked-by-rules'],
  ] as const)('%s puts the PR in %s with %s', (state, bucket, code) => {
    const result = classifyMyPr(makePr({ mergeStateStatus: state }));

    expect(result.bucket).toBe(bucket);
    expect(codesOf(result)).toEqual([code]);
  });

  it('reads BLOCKED with a required review as waiting on review', () => {
    const result = classifyMyPr(
      makePr({
        mergeStateStatus: 'BLOCKED',
        reviewDecision: 'REVIEW_REQUIRED',
      }),
    );

    expect(codesOf(result)).toEqual(['waiting-on-review']);
  });

  it('puts an UNSTABLE PR in ready with the optional checks warning first', () => {
    const result = classifyMyPr(makePr({ mergeStateStatus: 'UNSTABLE' }));

    expect(result.bucket).toBe('ready');
    expect(codesOf(result)).toEqual([
      'optional-checks-failing',
      'ready-to-merge',
    ]);
  });

  it('keeps an UNSTABLE PR in progress while checks are still running', () => {
    const result = classifyMyPr(
      makePr({
        mergeStateStatus: 'UNSTABLE',
        checks: checks(['failing', 'pending']),
      }),
    );

    expect(result.bucket).toBe('in-progress');
  });

  it('lists the failing optional checks by name when UNSTABLE', () => {
    const result = classifyMyPr(
      makePr({
        mergeStateStatus: 'UNSTABLE',
        checks: [
          { name: 'e2e', outcome: 'failing' },
          { name: 'build', outcome: 'passing' },
        ],
      }),
    );

    expect(result.reasons[0].label).toContain('e2e');
  });

  it.each([
    [2, 'checking-mergeability'],
    [3, 'mergeability-unknown'],
  ] as const)(
    'reads UNKNOWN seen for %i syncs in a row as %s',
    (unknownMergeStreak, code) => {
      const result = classifyMyPr(makePr({ mergeStateStatus: 'UNKNOWN' }), {
        unknownMergeStreak,
      });

      expect(result.bucket).toBe('in-progress');
      expect(codesOf(result)).toEqual([code]);
    },
  );

  it('never marks an approved green PR ready unless the merge state allows it', () => {
    const result = classifyMyPr(
      makePr({
        reviewDecision: 'APPROVED',
        ci: 'passing',
        mergeStateStatus: 'BLOCKED',
      }),
    );

    expect(result.bucket).toBe('in-progress');
  });
});

describe('classifyMyPr needs-you reasons', () => {
  it('names the check when exactly one fails', () => {
    const result = classifyMyPr(
      makePr({
        mergeStateStatus: 'BLOCKED',
        checks: [
          { name: 'Lint', outcome: 'failing' },
          { name: 'Test', outcome: 'passing' },
        ],
      }),
    );

    expect(result.bucket).toBe('needs-you');
    expect(result.reasons[0].label).toBe('Lint failing');
  });

  it('counts failing checks when more than one fails', () => {
    const result = classifyMyPr(
      makePr({ checks: checks(['failing', 'failing', 'passing']) }),
    );

    expect(result.reasons[0].label).toBe('2 checks failing');
  });

  it('treats failing CI without check detail as failing', () => {
    const result = classifyMyPr(makePr({ ci: 'failing', checks: [] }));

    expect(codesOf(result)).toEqual(['checks-failing']);
  });

  it('flags requested changes', () => {
    const result = classifyMyPr(
      makePr({ reviewDecision: 'CHANGES_REQUESTED' }),
    );

    expect(result.bucket).toBe('needs-you');
    expect(codesOf(result)).toEqual(['changes-requested']);
  });

  it('flags unresolved threads even when the merge state is clean', () => {
    const result = classifyMyPr(makePr({ unresolvedThreads: 3 }));

    expect(result.bucket).toBe('needs-you');
    expect(codesOf(result)).toEqual(['unresolved-threads']);
  });

  it('orders reasons from most to least severe', () => {
    const result = classifyMyPr(
      makePr({
        mergeStateStatus: 'BEHIND',
        unresolvedThreads: 1,
        reviewDecision: 'CHANGES_REQUESTED',
      }),
    );

    expect(result.reasons[0].severity).toBe('danger');
    expect(result.reasons.at(-1)?.severity).toBe('warning');
  });
});

describe('classifyMyPr in-progress reasons', () => {
  it('keeps a clean draft in progress', () => {
    const result = classifyMyPr(makePr({ isDraft: true }));

    expect(result.bucket).toBe('in-progress');
    expect(codesOf(result)).toEqual(['draft']);
  });

  it('shows CI progress from the checks', () => {
    const result = classifyMyPr(
      makePr({
        ci: 'running',
        mergeStateStatus: 'BLOCKED',
        checks: checks([
          ...Array(6).fill('passing'),
          'pending',
          'pending',
          'pending',
        ]),
      }),
    );

    expect(result.bucket).toBe('in-progress');
    expect(result.reasons.map((reason) => reason.label)).toContain(
      'CI running · 6 of 9',
    );
  });

  it('does not treat a PR without checks as blocked', () => {
    const result = classifyMyPr(makePr({ ci: 'none', checks: [] }));

    expect(result.bucket).toBe('ready');
  });
});

describe('classifyMyPr queue status', () => {
  it('keeps a queued PR in progress instead of ready', () => {
    const result = classifyMyPr(makePr(), {
      unknownMergeStreak: 1,
      queue: { kind: 'queued', tool: 'trunk', by: 'li', at: null, url: null },
    });

    expect(result.bucket).toBe('in-progress');
    expect(result.reasons).toEqual([
      { code: 'in-queue', label: 'In Trunk queue', severity: 'neutral' },
    ]);
  });

  it('puts a PR the queue removed back in Needs you', () => {
    const result = classifyMyPr(makePr(), {
      unknownMergeStreak: 1,
      queue: { kind: 'removed', tool: 'github', reason: null, url: null },
    });

    expect(result.bucket).toBe('needs-you');
    expect(codesOf(result)).toEqual(['removed-from-queue']);
    expect(result.reasons[0].label).toBe('Removed from merge queue');
  });
});

describe('classifyMyPr stale', () => {
  const failing = { ci: 'failing' as const };

  function classifyQuiet(
    days: number,
    overrides: Parameters<typeof makePr>[0] = failing,
    keptAt: string | null = null,
  ) {
    return classifyMyPr(
      makePr({ lastActivityAt: daysAgo(days), ...overrides }),
      { unknownMergeStreak: 1, now: NOW, keptAt },
    );
  }

  it('moves a PR quiet for 15 days to Stale, with the stale reason first', () => {
    const result = classifyQuiet(15);

    expect(result.bucket).toBe('stale');
    expect(result.reasons[0]).toEqual({
      code: 'stale',
      label: 'No activity for 15d',
      severity: 'warning',
    });
    expect(codesOf(result)).toContain('checks-failing');
  });

  it('keeps a PR quiet for 13 days where it was', () => {
    expect(classifyQuiet(13).bucket).toBe('needs-you');
  });

  it('never marks a ready PR stale', () => {
    expect(classifyQuiet(15, {}).bucket).toBe('ready');
  });

  it('never marks a queued PR stale', () => {
    const result = classifyMyPr(makePr({ lastActivityAt: daysAgo(30) }), {
      unknownMergeStreak: 1,
      now: NOW,
      queue: { kind: 'queued', tool: 'trunk', by: 'li', at: null, url: null },
    });

    expect(result.bucket).toBe('in-progress');
  });

  it('puts a kept stale PR in Kept until the keep ends', () => {
    const result = classifyQuiet(20, failing, daysAgo(4));

    expect(result.bucket).toBe('kept');
    expect(result.keptUntil).toBe(daysAgo(4 - 30));
  });

  it('ends a keep when there is activity after it', () => {
    expect(classifyQuiet(15, failing, daysAgo(16)).bucket).toBe('stale');
  });

  it('ends a keep after 30 days', () => {
    expect(classifyQuiet(40, failing, daysAgo(31)).bucket).toBe('stale');
  });
});

describe('classifyMyPr Korev working', () => {
  const conflicting = makePr({
    mergeStateStatus: 'DIRTY',
    mergeable: 'CONFLICTING',
    lastActivityAt: daysAgo(40),
  });

  it('moves a PR Korev is fixing out of Needs you, keeping its reasons', () => {
    const result = classifyMyPr(conflicting, {
      unknownMergeStreak: 1,
      now: NOW,
      korevWorking: true,
    });

    expect(result.bucket).toBe('korev-working');
    expect(codesOf(result)).toEqual(['conflicts']);
  });

  it('keeps a PR in Needs you while Korev waits for an answer', () => {
    const result = classifyMyPr(conflicting, {
      unknownMergeStreak: 1,
      needsAnswer: true,
      korevWorking: true,
    });

    expect(result.bucket).toBe('needs-you');
  });
});
