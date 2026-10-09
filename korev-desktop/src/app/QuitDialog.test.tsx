import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppState, ChatSession } from '../shared/model';
import { QuitDialog, QuitPending } from './QuitDialog';
import { resetUiForTests, setUi } from './ui-store';

afterEach(() => {
  cleanup();
  resetUiForTests();
});

function session(id: string, title: string) {
  return { id, title } as ChatSession;
}

const state = {
  repos: [{ id: 'r1', name: 'acme-web' }],
  workspaces: [
    {
      id: 'w1',
      repoId: 'r1',
      name: 'login-page',
      sessions: [session('s1', 'Build the form'), session('s2', 'Idle chat')],
    },
  ],
  askChats: [{ id: 'a1', session: session('s3', 'Where is the README?') }],
  runningSessions: ['s1', 's3'],
  waitingSessions: [],
} as unknown as AppState;

function renderQuit() {
  const call = vi.fn(async () => undefined);
  window.korev = { call, on: () => () => {} } as unknown as Window['korev'];
  setUi({ quit: 'asking' });
  render(
    <>
      <QuitDialog state={state} />
      <QuitPending state={state} />
    </>,
  );
  return call;
}

describe('QuitDialog', () => {
  it('lists only the agents that are still working', () => {
    renderQuit();
    expect(
      screen.getByRole('dialog', { name: '2 agents still working' }),
    ).toBeTruthy();
    expect(screen.getByText('login-page')).toBeTruthy();
    expect(screen.getByText('Where is the README?')).toBeTruthy();
    expect(screen.queryByText(/Idle chat/)).toBeNull();
  });

  it('waits for the agents and offers to quit now or stay open', () => {
    const call = renderQuit();
    fireEvent.click(screen.getByRole('button', { name: 'Quit when done' }));
    expect(call).toHaveBeenCalledWith('chooseQuit', ['wait']);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: "Don't quit" }));
    expect(call).toHaveBeenLastCalledWith('chooseQuit', ['cancel']);
    expect(screen.queryByText('Korev quits when the agents finish')).toBeNull();
  });
});
