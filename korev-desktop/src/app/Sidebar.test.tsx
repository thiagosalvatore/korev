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
import { getUi, resetUiForTests, setUi, type GridPane } from './ui-store';

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
    expect(screen.queryByRole('menu')).toBeNull();
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

  it('shows the group once, under Across repos, and points each repository to it', () => {
    render(<Sidebar state={grouped} />);

    const acrossRepos = screen.getByRole('region', { name: 'Across repos' });
    const group = within(acrossRepos).getByRole('group', {
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
    for (const name of ['busy-repo', 'idle-repo']) {
      const repo = screen.getByRole('region', { name });
      expect(
        within(repo).queryAllByRole('button', {
          name: /^Workspace add-billing/,
        }),
      ).toEqual([]);
      expect(repo.textContent).toContain('Also in 1 linked above');
    }
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

  it('keeps extra folders out of the menu behind More folders', () => {
    const crowded = {
      ...foldered,
      workspaceFolders: [
        { id: 'wave', repoId: 'busy', name: 'Wave 1' },
        { id: 'wave-2', repoId: 'busy', name: 'Wave 2' },
        { id: 'wave-3', repoId: 'busy', name: 'Wave 3' },
        { id: 'backlog', repoId: 'busy', name: 'Backlog' },
      ],
    } as unknown as AppState;
    render(<Sidebar state={crowded} />);
    const row = screen.getByRole('button', { name: 'Workspace login-page' });

    fireEvent.click(
      within(row).getByRole('button', { name: 'Workspace actions' }),
    );
    expect(screen.getByRole('menuitem', { name: 'Wave 2' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Backlog' })).toBeNull();

    fireEvent.click(screen.getByRole('menuitem', { name: 'More folders…' }));
    const picker = screen.getByRole('dialog', { name: 'Move to folder' });
    fireEvent.change(within(picker).getByRole('textbox'), {
      target: { value: 'back' },
    });
    expect(within(picker).queryByRole('button', { name: 'Wave 1' })).toBeNull();
    fireEvent.click(within(picker).getByRole('button', { name: 'Backlog' }));

    expect(window.korev.call).toHaveBeenCalledWith('moveWorkspace', [
      'w1',
      'backlog',
    ]);
    expect(screen.queryByRole('dialog', { name: 'Move to folder' })).toBeNull();
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
      screen
        .getByRole('button', { name: 'New Ask' })
        .getAttribute('aria-current'),
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
  const withAsk = (repoIds: string[]) =>
    ({
      ...state,
      askChats: [{ ...state.askChats[0], repoIds }],
    }) as unknown as AppState;
  const askRow = () =>
    screen.getByRole('button', { name: 'Ask How does login work?' });

  it('shows an Ask under its repository', () => {
    render(<Sidebar state={state} />);

    expect(
      within(screen.getByRole('region', { name: 'busy-repo' })).getByRole(
        'button',
        { name: 'Ask How does login work?' },
      ),
    ).toBe(askRow());
  });

  it('shows an Ask about two repositories once, under Across repos', () => {
    render(<Sidebar state={withAsk(['busy', 'idle'])} />);

    const acrossRepos = screen.getByRole('region', { name: 'Across repos' });
    expect(within(acrossRepos).getByRole('button', { name: /^Ask / })).toBe(
      askRow(),
    );
    expect(askRow().textContent).toContain('busy-repo, idle-repo');
    expect(
      screen.getByRole('region', { name: 'busy-repo' }).textContent,
    ).toContain('Also in 1 Ask above');
  });

  it('shows an Ask without a repository in its own group', () => {
    render(<Sidebar state={withAsk([])} />);

    expect(
      within(screen.getByRole('region', { name: 'No repository' })).getByRole(
        'button',
        { name: 'Ask How does login work?' },
      ),
    ).toBe(askRow());
  });

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

  it('folds the Asks of a repository', () => {
    render(<Sidebar state={state} />);

    fireEvent.click(
      within(screen.getByRole('group', { name: 'Asks' })).getByRole('button', {
        expanded: true,
      }),
    );

    expect(
      screen.queryByRole('button', { name: 'Ask How does login work?' }),
    ).toBeNull();
  });
});

describe('Sidebar waiting for you', () => {
  const waiting = {
    ...state,
    workspaces: [
      ...state.workspaces,
      {
        id: 'w3',
        repoId: 'idle',
        name: 'fix-billing',
        branch: 'fix-billing',
        createdAt: '2026-01-03T00:00:00Z',
        sessions: [],
      },
    ],
    runtime: {
      w1: { status: 'idle', unread: true, prs: [] },
      w3: { status: 'waiting', unread: false, prs: [] },
    },
  } as unknown as AppState;
  const section = () =>
    screen.queryByRole('region', { name: 'Waiting for you' });

  it('lists the workspaces that wait for you, the ones that need input first', () => {
    setUi({ collapsedRepos: ['idle'] });
    render(<Sidebar state={waiting} />);

    const rows = within(section()!).getAllByRole('button');
    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual([
      'Open fix-billing in idle-repo',
      'Open login-page in busy-repo',
    ]);

    fireEvent.click(rows[0]);

    expect(getUi()).toMatchObject({
      workspaceId: 'w3',
      page: { kind: 'workspace' },
    });
  });

  it('lists a waiting Ask after the workspaces that need input', () => {
    setUi({ collapsedRepos: ['busy'] });
    render(<Sidebar state={{ ...waiting, waitingSessions: ['as1'] }} />);

    const rows = within(section()!).getAllByRole('button');
    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual([
      'Open fix-billing in idle-repo',
      'Open Ask How does login work?',
      'Open login-page in busy-repo',
    ]);
    expect(
      within(screen.getByRole('region', { name: 'busy-repo' })).getByLabelText(
        '2 waiting for you',
      ),
    ).toBeTruthy();

    fireEvent.click(rows[1]);

    expect(getUi().page).toMatchObject({ kind: 'ask', askChatId: 'a1' });
  });

  it('hides the section when nothing waits for you', () => {
    render(<Sidebar state={state} />);

    expect(section()).toBeNull();
  });

  it('marks a collapsed repo that hides a waiting workspace', () => {
    setUi({ collapsedRepos: ['idle'] });
    render(<Sidebar state={waiting} />);

    const repo = (name: string) => screen.getByRole('region', { name });
    expect(
      within(repo('idle-repo')).getByLabelText('1 waiting for you'),
    ).toBeTruthy();
    expect(
      within(repo('busy-repo')).queryByLabelText(/waiting for you/),
    ).toBeNull();
  });
});

describe('Sidebar pages', () => {
  const ALL_PAGES = [
    'search',
    'new-workspace',
    'grid',
    'board',
    'pull-requests',
    'runs',
    'automations',
    'ask',
  ];
  const pages = () => screen.queryByRole('group', { name: 'Pages' });
  const askChat = () =>
    screen.queryByRole('button', { name: 'Ask How does login work?' });

  it('hides the pages the user unticked', () => {
    setUi({ hiddenNavEntries: ['board'] });
    render(<Sidebar state={state} />);

    expect(
      within(pages()!).queryByRole('button', { name: /^Board/ }),
    ).toBeNull();
    expect(
      within(pages()!).getByRole('button', { name: /^Grid/ }),
    ).toBeTruthy();
  });

  it('drops the pages block when every page is hidden', () => {
    setUi({ hiddenNavEntries: ALL_PAGES });
    render(<Sidebar state={state} />);

    expect(pages()).toBeNull();
  });

  it('shows the pages as one row of icons in compact mode', () => {
    setUi({ compactNav: true, page: { kind: 'board' } });
    render(<Sidebar state={state} />);

    expect(
      within(pages()!)
        .getByRole('button', { name: 'Board' })
        .getAttribute('aria-current'),
    ).toBe('page');
  });

  it('marks New Ask only while the Ask page is blank', () => {
    const newAsk = () =>
      within(pages()!)
        .getByRole('button', { name: /^New Ask/ })
        .getAttribute('aria-current');
    setUi({ page: { kind: 'ask', askChatId: 'a1', repoIds: [] } });
    const { rerender } = render(<Sidebar state={state} />);
    expect(newAsk()).toBeNull();

    setUi({ page: { kind: 'ask', askChatId: null, repoIds: [] } });
    rerender(<Sidebar state={{ ...state }} />);
    expect(newAsk()).toBe('page');
  });

  it('keeps the Ask chats in their repositories when New Ask is hidden', () => {
    setUi({ hiddenNavEntries: ['ask'] });
    render(<Sidebar state={state} />);

    expect(
      within(pages()!).queryByRole('button', { name: /^New Ask/ }),
    ).toBeNull();
    expect(askChat()).toBeTruthy();
  });

  it('hides a page from the customize menu and keeps the menu open', () => {
    render(<Sidebar state={state} />);
    fireEvent.click(screen.getByRole('button', { name: 'Customize sidebar' }));
    const board = () => screen.getByRole('menuitemcheckbox', { name: 'Board' });
    expect(board().getAttribute('aria-checked')).toBe('true');

    fireEvent.click(board());

    expect(board().getAttribute('aria-checked')).toBe('false');
    expect(
      within(pages()!).queryByRole('button', { name: /^Board/ }),
    ).toBeNull();
  });
});
