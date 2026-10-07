import { describe, expect, it } from 'vitest';
import {
  primaryPr,
  type AppState,
  type PrStatus,
  type Workspace,
  type WorkspaceRuntime,
} from '../shared/model';
import { nextAction } from './WorkspaceHeader';

const READY_PR: PrStatus = {
  number: 7,
  url: 'https://github.com/acme/web/pull/7',
  title: 'Add login',
  state: 'OPEN',
  isDraft: false,
  mergeable: 'MERGEABLE',
  reviewDecision: 'APPROVED',
  mergedAt: null,
  headRefName: 'dev/login',
  baseRefName: 'main',
  createdAt: '2026-01-01T00:00:00Z',
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

  it('acts on the PR still open when another one already merged', () => {
    const workspace = { branch: 'dev/login' } as Workspace;
    const merged: PrStatus = { ...READY_PR, number: 6, state: 'MERGED' };
    const stacked: PrStatus = {
      ...READY_PR,
      number: 8,
      headRefName: 'dev/login-part-2',
    };
    const runtime = { prs: [merged, stacked] } as WorkspaceRuntime;

    expect(primaryPr(workspace, runtime)?.number).toBe(8);
  });
});
