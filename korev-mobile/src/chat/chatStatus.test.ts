import { describe, expect, it } from 'vitest';
import type {
  CheckState,
  PrStatus,
} from '../../../korev-desktop/src/shared/model';
import { chatStatus, prCapsuleLabel } from './chatStatus';

function pr(overrides: Partial<PrStatus> = {}): PrStatus {
  return {
    number: 87,
    url: 'https://github.com/acme/web/pull/87',
    title: 'Fix login redirect',
    state: 'OPEN',
    isDraft: false,
    mergeable: 'MERGEABLE',
    reviewDecision: null,
    mergedAt: null,
    headRefName: 'fix-login',
    headRefOid: 'abc',
    baseRefName: 'main',
    createdAt: '2026-11-22T10:00:00.000Z',
    checks: [],
    stack: null,
    unansweredThreads: [],
    prSteward: false,
    ...overrides,
  };
}

function checks(states: Record<string, CheckState>): PrStatus['checks'] {
  return Object.entries(states).map(([name, state]) => ({
    name,
    state,
    url: null,
    required: true,
  }));
}

describe('chatStatus', () => {
  it('says the agent works while it runs, even with a PR ready', () => {
    expect(chatStatus({ running: true, waiting: true, pr: pr() })).toEqual({
      kind: 'working',
      label: 'Working',
    });
  });

  it('asks for an answer when the chat waits for one', () => {
    expect(chatStatus({ running: false, waiting: true, pr: null })).toEqual({
      kind: 'waiting',
      label: 'Needs your answer',
    });
  });

  it('follows the next PR step once the agent is idle', () => {
    const status = (prStatus: PrStatus) =>
      chatStatus({ running: false, waiting: false, pr: prStatus })?.label;
    expect(status(pr())).toBe('Ready to merge');
    expect(status(pr({ state: 'MERGED' }))).toBe('Merged');
    expect(status(pr({ checks: checks({ e2e: 'failure' }) }))).toBe(
      'Checks failing',
    );
    expect(status(pr({ mergeable: 'CONFLICTING' }))).toBe('Has conflicts');
  });

  it('falls back to the finished turn when there is no PR step to take', () => {
    expect(
      chatStatus({
        running: false,
        waiting: false,
        pr: null,
        finished: 'Completed in 9s',
      }),
    ).toEqual({ kind: 'idle', label: 'Completed in 9s' });
  });

  it('shows nothing for an idle chat with no PR step to take', () => {
    expect(chatStatus({ running: false, waiting: false, pr: null })).toBeNull();
    expect(
      chatStatus({
        running: false,
        waiting: false,
        pr: pr({ checks: checks({ test: 'pending' }) }),
      }),
    ).toBeNull();
  });
});

describe('prCapsuleLabel', () => {
  it('says when there is no PR yet', () => {
    expect(prCapsuleLabel(null)).toBe('No PR yet');
  });

  it('names the failing check, or counts them when several fail', () => {
    expect(
      prCapsuleLabel(
        pr({ checks: checks({ e2e: 'failure', lint: 'success' }) }),
      ),
    ).toBe('#87 · e2e failing');
    expect(
      prCapsuleLabel(
        pr({ checks: checks({ e2e: 'failure', lint: 'failure' }) }),
      ),
    ).toBe('#87 · 2 checks failing');
  });

  it('says the checks passed once every check succeeded', () => {
    expect(
      prCapsuleLabel(
        pr({ checks: checks({ test: 'success', lint: 'skipped' }) }),
      ),
    ).toBe('#87 · checks passed');
  });

  it('falls back to the PR badge', () => {
    expect(prCapsuleLabel(pr({ state: 'MERGED' }))).toBe('#87 · merged');
    expect(prCapsuleLabel(pr({ checks: checks({ test: 'pending' }) }))).toBe(
      '#87 · checks running',
    );
    expect(prCapsuleLabel(pr())).toBe('#87 · open');
  });
});
