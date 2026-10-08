import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState } from '../shared/model';
import { ASK_DRAG_TYPE, WORKSPACE_DRAG_TYPE } from './dnd';
import { GridView } from './GridView';
import { getUi, resetUiForTests } from './ui-store';

afterEach(() => {
  cleanup();
  resetUiForTests();
});

beforeEach(() => {
  window.korev = {
    call: vi.fn(async (method: string) => responses[method] ?? null),
    on: () => () => {},
  } as unknown as Window['korev'];
});

const ask = {
  id: 'a1',
  repoIds: ['r1'],
  session: { id: 'as1', title: 'How does login work?', agent: 'claude' },
  createdAt: '2026-01-01T00:00:00Z',
  lastMessageAt: '2026-01-01T00:00:00Z',
};

const responses: Record<string, unknown> = {
  newSession: { id: 's2' },
  createAskChat: ask,
  send: { ok: true, value: undefined },
};

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
  askChats: [ask],
  agents: [],
  runningSessions: [],
  runtime: {},
  planLimits: {},
  settings: {
    snippets: [],
    loadout: [],
    defaultAgent: 'claude',
    defaultModels: { claude: 'sonnet' },
    defaultEffort: { claude: 'high' },
  },
} as unknown as AppState;

function drop(target: HTMLElement, type: string, id: string) {
  fireEvent.drop(target, {
    dataTransfer: { types: [type], getData: () => id },
  });
}

function dropWorkspace(target: HTMLElement, workspaceId: string) {
  drop(target, WORKSPACE_DRAG_TYPE, workspaceId);
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

  it('starts an ask chat in a pane', async () => {
    render(<GridView state={state} />);
    const pane = screen.getByRole('region', { name: 'Pane 1' });

    fireEvent.click(within(pane).getByRole('button', { name: 'Ask' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New ask' }));
    const message = within(pane).getByRole('textbox', { name: 'Message' });
    fireEvent.change(message, { target: { value: 'How does login work?' } });
    fireEvent.keyDown(message, { key: 'Enter' });

    await waitFor(() =>
      expect(getUi().grid.panes[0]).toEqual({ askChatId: 'a1' }),
    );
    expect(window.korev.call).toHaveBeenCalledWith('createAskChat', [['r1']]);
  });

  it('shows a dropped Ask chat in the pane', () => {
    render(<GridView state={state} />);

    drop(screen.getByRole('region', { name: 'Pane 2' }), ASK_DRAG_TYPE, 'a1');

    expect(getUi().grid.panes[1]).toEqual({ askChatId: 'a1' });
  });
});
