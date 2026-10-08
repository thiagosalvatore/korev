import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState } from '../shared/model';
import { WORKSPACE_DRAG_TYPE } from './dnd';
import { GridView } from './GridView';
import { getUi, resetUiForTests } from './ui-store';

afterEach(() => {
  cleanup();
  resetUiForTests();
});

beforeEach(() => {
  window.korev = {
    call: vi.fn(async (method: string) =>
      method === 'newSession' ? { id: 's2' } : null,
    ),
    on: () => () => {},
  } as unknown as Window['korev'];
});

const state = {
  repos: [{ id: 'r1', name: 'korev' }],
  folders: [],
  rootOrder: ['r1'],
  workspaces: [
    {
      id: 'w1',
      repoId: 'r1',
      name: 'login-page',
      branch: 'fix-login',
      createdAt: '2026-01-01T00:00:00Z',
      archivedAt: null,
      sessions: [{ id: 's1', title: 'Fix login', agent: 'claude' }],
    },
  ],
  askChats: [],
  agents: [],
  runningSessions: [],
  runtime: {},
  planLimits: {},
  settings: { snippets: [], loadout: [], defaultAgent: 'claude' },
} as unknown as AppState;

function dropWorkspace(target: HTMLElement, workspaceId: string) {
  fireEvent.drop(target, {
    dataTransfer: {
      types: [WORKSPACE_DRAG_TYPE],
      getData: () => workspaceId,
    },
  });
}

describe('GridView', () => {
  it('shows a dropped workspace in the pane and opens it in the full view', () => {
    render(<GridView state={state} />);

    dropWorkspace(screen.getByRole('region', { name: 'Pane 2' }), 'w1');
    fireEvent.click(screen.getByRole('button', { name: 'Open in full view' }));

    expect(getUi().page).toEqual({ kind: 'workspace' });
    expect(getUi().workspaceId).toBe('w1');
    expect(getUi().workspaces.w1.activeKey).toBe('chat:s1');
  });

  it('starts a new chat instead of taking the chat another pane shows', async () => {
    render(<GridView state={state} />);

    dropWorkspace(screen.getByRole('region', { name: 'Pane 1' }), 'w1');
    dropWorkspace(screen.getByRole('region', { name: 'Pane 2' }), 'w1');

    await waitFor(() =>
      expect(getUi().grid.panes.slice(0, 2)).toEqual([
        { workspaceId: 'w1', tabKey: 'chat:s1' },
        { workspaceId: 'w1', tabKey: 'chat:s2' },
      ]),
    );
  });
});
