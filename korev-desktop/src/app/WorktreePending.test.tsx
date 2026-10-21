import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState, Workspace, WorkspaceRuntime } from '../shared/model';
import { loadDraft } from './chat/Composer';
import { NEW_WORKSPACE_DRAFT_KEY } from './actions';
import { getUi, resetUiForTests } from './ui-store';
import { WorktreePending } from './WorkspaceView';

const call = vi.fn(async () => ({ ok: true, value: undefined }));

beforeEach(() => {
  window.korev = { call, on: () => () => {} } as unknown as Window['korev'];
});

afterEach(() => {
  cleanup();
  resetUiForTests();
  localStorage.clear();
  call.mockClear();
});

const workspace = {
  id: 'ws',
  repoId: 'posthog',
  name: 'deprecate-mv',
  label: null,
  baseBranch: 'main',
} as Workspace;

const runtime = {
  status: 'failed',
  message: 'Could not create the worktree: hook broke',
  pendingPrompt: 'Deprecate the mv command',
} as WorkspaceRuntime;

describe('WorktreePending', () => {
  it('shows the failure and puts the task back in the new workspace composer on Try again', async () => {
    render(
      <WorktreePending
        state={{} as AppState}
        workspace={workspace}
        runtime={runtime}
      />,
    );
    expect(screen.getByText('hook broke')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await vi.waitFor(() =>
      expect(getUi().page).toEqual({
        kind: 'new-workspace',
        repoId: 'posthog',
      }),
    );
    expect(loadDraft(NEW_WORKSPACE_DRAFT_KEY)).toBe('Deprecate the mv command');
  });
});
