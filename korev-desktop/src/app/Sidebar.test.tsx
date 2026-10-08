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
import { resetUiForTests } from './ui-store';

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
  askChats: [],
  runningSessions: [],
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
