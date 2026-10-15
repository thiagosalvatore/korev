import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState } from '../shared/model';
import { BoardView } from './BoardView';
import { getUi, resetUiForTests } from './ui-store';

afterEach(() => {
  cleanup();
  resetUiForTests();
});

beforeEach(() => {
  window.korev = {
    call: vi.fn(async (method: string, args: unknown[]) =>
      method === 'transcript' && args[0] === 's1'
        ? [
            {
              id: 'i1',
              kind: 'assistant',
              text: 'Looked at the form.\nLogin is fixed.',
            },
          ]
        : [],
    ),
    on: () => () => {},
  } as unknown as Window['korev'];
});

function workspace(id: string, repoId: string, sessionId: string) {
  return {
    id,
    repoId,
    name: id,
    label: null,
    branch: `branch-${id}`,
    createdAt: '2026-01-01T00:00:00Z',
    archivedAt: null,
    sessions: [{ id: sessionId, title: id, agent: 'claude' }],
  };
}

const state = {
  repos: [
    { id: 'r1', name: 'korev' },
    { id: 'r2', name: 'site' },
  ],
  folders: [],
  rootOrder: ['r1', 'r2'],
  workspaces: [
    workspace('login', 'r1', 's1'),
    workspace('docs', 'r2', 's2'),
    workspace('old', 'r1', 's3'),
  ],
  runtime: {
    login: { status: 'idle', unread: true, prs: [] },
    docs: { status: 'working', unread: false, prs: [] },
    old: { status: 'idle', unread: false, prs: [] },
  },
} as unknown as AppState;

function column(name: string) {
  return within(screen.getByRole('region', { name }));
}

describe('BoardView', () => {
  it('puts workspaces from every repository in their columns', () => {
    render(<BoardView state={state} />);

    expect(column('Working').getByText('branch-docs')).toBeTruthy();
    expect(column('Working').getByText('site')).toBeTruthy();
    expect(column('Done').getByText('branch-login')).toBeTruthy();
    expect(column('Idle').getByText('branch-old')).toBeTruthy();
    expect(column('Needs you').queryAllByRole('button')).toHaveLength(0);
  });

  it('shows the last line the agent wrote', async () => {
    render(<BoardView state={state} />);

    expect(await column('Done').findByText('Login is fixed.')).toBeTruthy();
  });

  it('opens the workspace of a clicked card', () => {
    render(<BoardView state={state} />);

    fireEvent.click(screen.getByRole('button', { name: 'Workspace login' }));

    expect(getUi().page).toEqual({ kind: 'workspace' });
    expect(getUi().workspaceId).toBe('login');
  });
});
