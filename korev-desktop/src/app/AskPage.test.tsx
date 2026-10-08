import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState } from '../shared/model';
import { AskPage } from './AskPage';
import { resetUiForTests } from './ui-store';

const ask = {
  id: 'a1',
  repoIds: [],
  session: { id: 'as1', title: 'What is a monad?', agent: 'claude' },
  createdAt: '2026-01-01T00:00:00Z',
  lastMessageAt: '2026-01-01T00:00:00Z',
};

const responses: Record<string, unknown> = {
  createAskChat: ask,
  send: { ok: true, value: undefined },
};

const state = {
  repos: [],
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

describe('AskPage', () => {
  it('asks a question without a repository', async () => {
    render(<AskPage state={state} askChatId={null} repoIds={[]} />);

    const message = screen.getByRole('textbox', { name: 'Message' });
    fireEvent.change(message, { target: { value: 'What is a monad?' } });
    fireEvent.keyDown(message, { key: 'Enter' });

    await waitFor(() =>
      expect(window.korev.call).toHaveBeenCalledWith('createAskChat', [[]]),
    );
  });

  it('has no Start workspace for an Ask chat without a repository', () => {
    render(<AskPage state={state} askChatId="a1" repoIds={[]} />);

    expect(screen.getByText('No repository · read-only')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Start workspace' }),
    ).toBeNull();
  });
});
