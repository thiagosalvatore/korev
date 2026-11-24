import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState, ChatMatch } from '../shared/model';
import { CommandPalette } from './CommandPalette';
import { getUi, resetUiForTests, setUi } from './ui-store';

const state = {
  repos: [{ id: 'r1', name: 'acme' }],
  workspaces: [
    {
      id: 'w1',
      repoId: 'r1',
      name: 'login-page',
      label: null,
      branch: 'login-page',
      createdAt: '2026-01-01T00:00:00Z',
      archivedAt: null,
      sessions: [{ id: 's1', title: 'Fix login' }],
      prs: [{ url: 'https://github.com/acme/web/pull/292', sessionId: 's1' }],
    },
  ],
  askChats: [],
  agents: [],
  settings: {},
} as unknown as AppState;

const match: ChatMatch = {
  sessionId: 's1',
  owner: { kind: 'workspace', id: 'w1' },
  title: 'Fix login',
  snippet: 'Opened PR #290 for the login page',
};

beforeEach(() => {
  window.korev = {
    call: vi.fn(async (method: string, args: unknown[]) =>
      method === 'searchChats' && args[0] === '#290' ? [match] : [],
    ),
    on: () => () => {},
  } as unknown as Window['korev'];
  setUi({ palette: 'all' });
});

afterEach(() => {
  cleanup();
  resetUiForTests();
});

function search(query: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), {
    target: { value: query },
  });
}

describe('CommandPalette', () => {
  it('finds a workspace by the number of its PR', () => {
    render(<CommandPalette state={state} />);
    search('#292');
    expect(screen.getByRole('option', { name: /login-page/ })).toBeTruthy();
  });

  it('opens the chat whose history mentions the query', async () => {
    render(<CommandPalette state={state} />);
    search('#290');
    fireEvent.click(
      await screen.findByRole('option', { name: /Opened PR #290/ }),
    );
    expect(getUi().workspaceId).toBe('w1');
    expect(getUi().workspaces.w1.activeKey).toBe('chat:s1');
  });
});
