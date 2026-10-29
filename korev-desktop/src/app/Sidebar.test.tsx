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
import { Sidebar } from './Sidebar';
import { resetUiForTests, setUi, type GridPane } from './ui-store';

afterEach(() => {
  cleanup();
  resetUiForTests();
});

const state = {
  repos: [
    { id: 'busy', name: 'busy-repo' },
    { id: 'idle', name: 'idle-repo' },
  ],
  folders: [],
  workspaceFolders: [],
  rootOrder: ['busy', 'idle'],
  workspaces: [
    {
      id: 'w1',
      repoId: 'busy',
      name: 'login-page',
      branch: 'login-page',
      createdAt: '2026-01-01T00:00:00Z',
      sessions: [],
    },
    {
      id: 'w2',
      repoId: 'idle',
      name: 'old-work',
      branch: 'old-work',
      createdAt: '2026-01-01T00:00:00Z',
      archivedAt: '2026-01-02T00:00:00Z',
      sessions: [],
    },
  ],
  askChats: [
    {
      id: 'a1',
      repoIds: ['busy'],
      session: { id: 'as1', title: 'How does login work?', agent: 'claude' },
      createdAt: '2026-01-01T00:00:00Z',
      lastMessageAt: '2026-01-01T00:00:00Z',
    },
  ],
  runs: [],
  runningSessions: [],
  waitingSessions: [],
  runtime: {},
  remote: {},
} as unknown as AppState;

beforeEach(() => {
  window.korev = {
    call: vi.fn(async () => null),
    on: () => () => {},
  } as unknown as Window['korev'];
});

function repoHeader(name: string) {
  const section = screen.getByRole('region', { name });
  return section.querySelector('[aria-expanded]') as HTMLElement;
}

describe('Sidebar repo groups', () => {
  it('collapses repos without active workspaces by default', () => {
    render(<Sidebar state={state} />);
    expect(repoHeader('busy-repo').getAttribute('aria-expanded')).toBe('true');
    expect(repoHeader('idle-repo').getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps an empty repo open once the user expands it', () => {
    const { rerender } = render(<Sidebar state={state} />);
    fireEvent.click(repoHeader('idle-repo'));
    rerender(<Sidebar state={{ ...state }} />);
    expect(repoHeader('idle-repo').getAttribute('aria-expanded')).toBe('true');
    expect(
      within(screen.getByRole('region', { name: 'idle-repo' })).getByRole(
        'button',
        { name: 'New workspace' },
      ),
    ).toBeTruthy();
  });

  it('opens an empty repo when its first workspace is created', () => {
    const { rerender } = render(<Sidebar state={state} />);
    fireEvent.click(repoHeader('idle-repo'));
    fireEvent.click(repoHeader('idle-repo'));
    rerender(
      <Sidebar
        state={{
          ...state,
          workspaces: state.workspaces.map((ws) => ({
            ...ws,
            archivedAt: null,
          })),
        }}
      />,
    );
    expect(repoHeader('idle-repo').getAttribute('aria-expanded')).toBe('true');
  });
});

describe('Sidebar workspace name', () => {
  const renamed = {
    ...state,
    workspaces: state.workspaces.map((ws) =>
      ws.id === 'w1' ? { ...ws, label: 'Billing spike' } : ws,
    ),
  } as unknown as AppState;

  it('shows the name the user gave under the branch', () => {
    render(<Sidebar state={renamed} />);
    const row = screen.getByRole('button', { name: 'Workspace Billing spike' });
    expect(row.textContent).toContain('login-page');
    expect(row.textContent).toContain('Billing spike');
  });

  it('renames a workspace from its menu', async () => {
    render(<Sidebar state={state} />);
    const row = screen.getByRole('button', { name: 'Workspace login-page' });
    fireEvent.click(
      within(row).getByRole('button', { name: 'Workspace actions' }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Billing spike' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    await waitFor(() =>
      expect(window.korev.call).toHaveBeenCalledWith('renameWorkspace', [
        'w1',
        'Billing spike',
      ]),
    );
  });
});

describe('Sidebar group across repositories', () => {
  const member = (id: string, repoId: string, awaitsLane: boolean) => ({
    id,
    repoId,
    groupId: 'billing',
    name: 'add-billing',
    branch: 'dev/add-billing',
    createdAt: '2026-01-01T00:00:00Z',
    archivedAt: null,
    awaitsLane,
    sessions: [],
    prs: [],
  });
  const grouped = {
    ...state,
    workspaces: [member('lead', 'busy', false), member('api', 'idle', true)],
  } as unknown as AppState;

  it('shows the group once, under the lead repository', () => {
    render(<Sidebar state={grouped} />);

    const busy = screen.getByRole('region', { name: 'busy-repo' });
    const group = within(busy).getByRole('group', {
      name: 'Linked workspace add-billing',
    });
    expect(
      within(group)
        .getAllByRole('button', { name: /^Workspace add-billing/ })
        .map((row) => row.getAttribute('aria-label')),
    ).toEqual([
      'Workspace add-billing in busy-repo',
      'Workspace add-billing in idle-repo',
    ]);
    expect(
      within(screen.getByRole('region', { name: 'idle-repo' })).queryAllByRole(
        'button',
        { name: /^Workspace add-billing/ },
      ),
    ).toEqual([]);
  });

  it('says which repository a member waits on', () => {
    render(<Sidebar state={grouped} />);

    const waiting = screen.getByRole('button', {
      name: 'Workspace add-billing in idle-repo',
    });
    expect(waiting.textContent).toContain('Waits for the plan in busy-repo');
  });
});

describe('Sidebar workspace folders', () => {
  const lane = (id: string, createdAt: string) => ({
    id,
    repoId: 'busy',
    groupId: null,
    folderId: 'wave',
    name: id,
    branch: `dev/${id}`,
    createdAt,
    archivedAt: null,
    awaitsLane: false,
    sessions: [],
    prs: [],
  });
  const foldered = {
    ...state,
    workspaceFolders: [{ id: 'wave', repoId: 'busy', name: 'Wave 1' }],
    workspaces: [
      ...state.workspaces,
      lane('settings-api', '2026-01-02T00:00:00Z'),
      lane('settings-ui', '2026-01-03T00:00:00Z'),
    ],
  } as unknown as AppState;
  const folder = () => screen.getByRole('group', { name: 'Folder Wave 1' });
  const rowsInFolder = () =>
    within(folder())
      .queryAllByRole('button', { name: /^Workspace settings/ })
      .map((row) => row.getAttribute('aria-label'));

  it('lists the workspaces of a folder under its name', () => {
    render(<Sidebar state={foldered} />);

    expect(rowsInFolder()).toEqual([
      'Workspace settings-api',
      'Workspace settings-ui',
    ]);
    expect(
      within(folder()).queryByRole('button', { name: 'Workspace login-page' }),
    ).toBeNull();
  });

  it('hides the workspaces of a collapsed folder', () => {
    render(<Sidebar state={foldered} />);

    fireEvent.click(within(folder()).getByRole('button', { expanded: true }));

    expect(rowsInFolder()).toEqual([]);
  });

  it('moves a workspace into a folder from its menu', () => {
    render(<Sidebar state={foldered} />);
    const row = screen.getByRole('button', { name: 'Workspace login-page' });

    fireEvent.click(
      within(row).getByRole('button', { name: 'Workspace actions' }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Wave 1' }));

    expect(window.korev.call).toHaveBeenCalledWith('moveWorkspace', [
      'w1',
      'wave',
    ]);
  });

  it('renames a folder', () => {
    render(<Sidebar state={foldered} />);

    fireEvent.click(
      within(folder()).getByRole('button', { name: 'Wave 1 actions' }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Wave 2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    expect(window.korev.call).toHaveBeenCalledWith('renameWorkspaceFolder', [
      'wave',
      'Wave 2',
    ]);
  });
});

describe('Sidebar on the grid page', () => {
  function showGrid(focusedPane: GridPane) {
    setUi((ui) => ({
      page: { kind: 'grid' },
      grid: { ...ui.grid, panes: [focusedPane, null, null, null], focused: 0 },
    }));
  }

  it('marks the Grid nav row', () => {
    showGrid({ workspaceId: 'w1', tabKey: 'chat:s1' });
    render(<Sidebar state={state} />);
    expect(
      screen
        .getByRole('button', { name: /^Grid/ })
        .getAttribute('aria-current'),
    ).toBe('page');
    expect(
      screen.getByRole('button', { name: 'Ask' }).getAttribute('aria-current'),
    ).toBeNull();
  });

  it('marks the workspace of the focused pane', () => {
    showGrid({ workspaceId: 'w1', tabKey: 'chat:s1' });
    render(<Sidebar state={state} />);
    expect(
      screen
        .getByRole('button', { name: 'Workspace login-page' })
        .getAttribute('aria-current'),
    ).toBe('page');
  });

  it('marks the Ask chat of the focused pane', () => {
    showGrid({ askChatId: 'a1' });
    render(<Sidebar state={state} />);
    expect(
      screen
        .getByRole('button', { name: 'Ask How does login work?' })
        .getAttribute('aria-current'),
    ).toBe('page');
  });
});

describe('Sidebar Ask chats', () => {
  it('leaves automation runs out of the Ask chats', () => {
    const run = {
      ...state.askChats[0],
      id: 'a2',
      session: { id: 'as2', title: 'Support tickets', agent: 'claude' },
      automationRun: { automationId: 'au1', workspaceIds: [], notes: [] },
    };
    render(
      <Sidebar
        state={{ ...state, askChats: [...state.askChats, run] } as AppState}
      />,
    );
    expect(
      screen.queryByRole('button', { name: 'Ask Support tickets' }),
    ).toBeNull();
  });

  it('marks an Ask chat that waits for your input', () => {
    render(
      <Sidebar
        state={{
          ...state,
          runningSessions: ['as1'],
          waitingSessions: ['as1'],
        }}
      />,
    );
    const row = screen.getByRole('button', {
      name: 'Ask How does login work?',
    });
    expect(within(row).getByTitle('Waiting for your input')).toBeTruthy();
  });
});
