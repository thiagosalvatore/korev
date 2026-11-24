import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KorevEvents } from '../shared/api';
import type { NewWorkspaceLink } from '../shared/korev-link';
import type { AppState, Repo } from '../shared/model';
import { NEW_WORKSPACE_DRAFT_KEY } from './actions';
import { loadDraft, saveDraft } from './chat/Composer';
import { getUi, resetUiForTests } from './ui-store';
import { useCommands } from './useCommands';

afterEach(() => {
  cleanup();
  resetUiForTests();
  localStorage.clear();
});

const state = {
  repos: [
    { id: 'r1', name: 'korev' },
    { id: 'r2', name: 'posthog' },
  ] as Repo[],
  workspaces: [],
} as unknown as AppState;

function bridgeWithLinks(queue: NewWorkspaceLink[][]) {
  const listeners = new Map<string, (payload: unknown) => void>();
  const call = vi.fn(async (method: string) =>
    method === 'takeLinks' ? (queue.shift() ?? []) : null,
  );
  window.korev = {
    call,
    on: (event: keyof KorevEvents, listener: (payload: unknown) => void) => {
      listeners.set(event, listener);
      return () => listeners.delete(event);
    },
  } as unknown as Window['korev'];
  return {
    call,
    emit: (event: keyof KorevEvents) => listeners.get(event)?.(null),
  };
}

describe('useCommands links', () => {
  it('opens New workspace with the link text once the state is loaded', async () => {
    saveDraft(NEW_WORKSPACE_DRAFT_KEY, 'old draft');
    const { call } = bridgeWithLinks([
      [{ prompt: 'Fix the login bug', repo: 'posthog' }],
    ]);
    const { rerender } = renderHook(({ current }) => useCommands(current), {
      initialProps: { current: null as AppState | null },
    });
    expect(call).not.toHaveBeenCalledWith('takeLinks', []);

    rerender({ current: state });

    await waitFor(() =>
      expect(getUi().page).toMatchObject({
        kind: 'new-workspace',
        repoId: 'r2',
      }),
    );
    expect(loadDraft(NEW_WORKSPACE_DRAFT_KEY)).toBe('Fix the login bug');
    expect(call).not.toHaveBeenCalledWith('send', expect.anything());
  });

  it('takes the next links when the main process says more arrived', async () => {
    const { emit } = bridgeWithLinks([
      [],
      [{ prompt: 'Second', repo: 'missing' }],
    ]);
    renderHook(() => useCommands(state));
    await waitFor(() => expect(window.korev.call).toHaveBeenCalledTimes(1));

    emit('open-link');

    await waitFor(() =>
      expect(getUi().page).toMatchObject({
        kind: 'new-workspace',
        repoId: null,
      }),
    );
    expect(loadDraft(NEW_WORKSPACE_DRAFT_KEY)).toBe('Second');
  });

  it('keeps the draft when the link has no text', async () => {
    saveDraft(NEW_WORKSPACE_DRAFT_KEY, 'keep me');
    bridgeWithLinks([[{ prompt: null, repo: null }]]);
    renderHook(() => useCommands(state));
    await waitFor(() =>
      expect(getUi().page).toMatchObject({ kind: 'new-workspace' }),
    );
    expect(loadDraft(NEW_WORKSPACE_DRAFT_KEY)).toBe('keep me');
  });
});
