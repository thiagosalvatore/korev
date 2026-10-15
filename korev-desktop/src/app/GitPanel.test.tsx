import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState, PrStatus, PrThread, Workspace } from '../shared/model';
import { GitPanel } from './GitPanel';
import { resetUiForTests, setUi } from './ui-store';

const workspace = {
  id: 'w1',
  repoId: 'r1',
  name: 'login-page',
  branch: 'login-page',
  baseBranch: 'main',
  sessions: [],
} as unknown as Workspace;

const pr: PrStatus = {
  number: 42,
  url: 'https://github.com/acme/web/pull/42',
  title: 'Add the login page',
  state: 'OPEN',
  isDraft: false,
  mergeable: 'MERGEABLE',
  reviewDecision: null,
  mergedAt: null,
  headRefName: 'login-page',
  baseRefName: 'main',
  createdAt: '2026-01-01T00:00:00Z',
  checks: [{ name: 'lint', state: 'success', url: null, required: true }],
  stack: null,
};

const thread: PrThread = {
  id: 't1',
  path: 'src/login.ts',
  line: 3,
  diffHunk: '',
  isResolved: false,
  isOutdated: false,
  comments: [
    {
      id: 'c1',
      author: 'alice',
      isBot: false,
      body: 'Rename this',
      url: 'https://github.com/acme/web/pull/42#c1',
      createdAt: '2026-01-01T00:00:00Z',
    },
  ],
};

function stateWith(prs: PrStatus[]): AppState {
  return {
    workspaces: [workspace],
    runtime: { w1: { prs } },
  } as unknown as AppState;
}

beforeEach(() => {
  window.korev = {
    call: vi.fn(async (method: string) => {
      if (method === 'prThreads') return [thread];
      return [];
    }),
    on: () => () => {},
  } as unknown as Window['korev'];
  setUi({ gitTab: 'pr' });
});

afterEach(() => {
  cleanup();
  resetUiForTests();
});

describe('GitPanel PR tab', () => {
  it('shows the checks and review comments of the open PR under its number', async () => {
    render(<GitPanel state={stateWith([pr])} workspace={workspace} />);

    expect(screen.getByRole('tab', { name: '#42' })).toBeTruthy();
    expect(screen.getByText('lint')).toBeTruthy();
    expect(await screen.findByText('Rename this')).toBeTruthy();
  });

  it('offers to create a PR when the workspace has none', () => {
    render(<GitPanel state={stateWith([])} workspace={workspace} />);

    expect(screen.getByRole('tab', { name: 'PR' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create PR' })).toBeTruthy();
  });
});
