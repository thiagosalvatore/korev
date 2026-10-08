import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState, Workspace } from '../shared/model';
import { resetUiForTests } from './ui-store';
import { WorkspaceHeader } from './WorkspaceHeader';

afterEach(() => {
  cleanup();
  resetUiForTests();
});

const workspace = {
  id: 'w1',
  repoId: 'web',
  name: 'login-page',
  branch: 'login-page',
  baseBranch: 'main',
  keepAfterMerge: false,
  sessions: [],
} as unknown as Workspace;

const state = {
  workspaces: [workspace],
  runtime: {},
  editors: [],
  settings: {},
} as unknown as AppState;

let call: ReturnType<typeof vi.fn>;

beforeEach(() => {
  call = vi.fn(async () => null);
  window.korev = { call, on: () => () => {} } as unknown as Window['korev'];
});

describe('WorkspaceHeader keep after merge', () => {
  it('toggles keep after merge for the workspace', () => {
    render(<WorkspaceHeader state={state} workspace={workspace} />);
    const toggle = screen.getByRole('button', { name: 'Keep after merge' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(call).toHaveBeenCalledWith('setKeepAfterMerge', ['w1', true]);
  });
});
