import {
  cleanup,
  fireEvent,
  render,
  screen,
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

describe('Sidebar on the grid page', () => {
  function showGrid(focusedPane: GridPane) {
    setUi((ui) => ({
      page: { kind: 'grid' },
      grid: { ...ui.grid, panes: [focusedPane, null, null, null], focused: 0 },
    }));
  }

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
