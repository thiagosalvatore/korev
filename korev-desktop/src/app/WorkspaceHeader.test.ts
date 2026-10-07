import { describe, expect, it } from 'vitest';
import type { AppState, PrStatus, Workspace } from '../shared/model';
import { nextAction } from './WorkspaceHeader';

const READY_PR: PrStatus = {
  number: 7,
  url: 'https://github.com/acme/web/pull/7',
  title: 'Add login',
  state: 'OPEN',
  isDraft: false,
  mergeable: 'MERGEABLE',
  reviewDecision: 'APPROVED',
  checks: [{ name: 'lint', state: 'success', url: null }],
};

function actionLabel(pr: PrStatus): string {
  return nextAction({} as AppState, {} as Workspace, pr).label;
}

describe('next PR action', () => {
  it('offers Merge once the PR is approved and checks pass', () => {
    expect(actionLabel(READY_PR)).toBe('Merge');
  });

  it('offers Merge when the repo requires no review', () => {
    expect(actionLabel({ ...READY_PR, reviewDecision: null })).toBe('Merge');
  });

  it('shows the PR is waiting for review', () => {
    expect(
      actionLabel({ ...READY_PR, reviewDecision: 'REVIEW_REQUIRED' }),
    ).toBe('Waiting for review');
  });

  it('shows checks are running before anything about review', () => {
    expect(
      actionLabel({
        ...READY_PR,
        reviewDecision: 'REVIEW_REQUIRED',
        checks: [{ name: 'lint', state: 'pending', url: null }],
      }),
    ).toBe('Checks running');
  });
});
