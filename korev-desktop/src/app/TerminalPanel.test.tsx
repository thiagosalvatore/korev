import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState, Workspace } from '../shared/model';
import { TerminalPanel } from './TerminalPanel';
import { resetUiForTests } from './ui-store';

vi.mock('./XTerm', () => ({
  XTerm: ({ terminalRef }: { terminalRef: string }) => (
    <div data-testid="xterm">{terminalRef}</div>
  ),
}));

const workspace = {
  id: 'w1',
  repoId: 'r1',
  name: 'login-page',
  branch: 'login-page',
  baseBranch: 'main',
  sessions: [],
} as unknown as Workspace;

const state = {
  workspaces: [workspace],
  repos: [],
  runtime: {},
  spotlights: {},
  runningTerminals: [],
} as unknown as AppState;

beforeEach(() => {
  window.korev = {
    call: vi.fn(async () => null),
    on: () => () => {},
  } as unknown as Window['korev'];
});

afterEach(() => {
  cleanup();
  resetUiForTests();
});

describe('TerminalPanel', () => {
  it('starts no terminal in a new workspace', () => {
    render(<TerminalPanel state={state} workspace={workspace} />);

    expect(screen.queryByTestId('xterm')).toBeNull();
    expect(
      screen
        .getAllByRole('tab')
        .some((tab) => tab.getAttribute('aria-selected') === 'true'),
    ).toBe(false);
  });

  it('starts the shell when the Terminal tab is clicked', () => {
    render(<TerminalPanel state={state} workspace={workspace} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Terminal' }));

    expect(screen.getByTestId('xterm').textContent).toBe('w1:shell');
  });
});
