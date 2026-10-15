import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState, OrchestrationRun } from '../shared/model';
import { RunsPage } from './RunsPage';

const call = vi.fn(async () => ({ ok: true, value: undefined }));

const run: OrchestrationRun = {
  id: 'run-1',
  coordinatorSessionId: 'lead-chat',
  coordinatorWorkspaceId: 'lead',
  objective: 'Ship billing',
  depth: 0,
  parentRunId: null,
  tasks: [
    {
      id: 't1',
      title: 'Migrate the database',
      spec: 'migrate',
      deps: [],
      repoId: null,
      status: 'pending',
      workspaceId: null,
      sessionId: null,
      result: null,
    },
  ],
  questions: [],
  gates: [
    {
      id: 'g1',
      taskId: 't1',
      question: 'Drop the old table?',
      options: ['yes', 'no'],
      resolution: null,
    },
  ],
  wakes: 0,
  paused: false,
  heldMessages: [],
  createdAt: '2026-01-01T00:00:00Z',
};

const state = {
  workspaces: [{ id: 'lead', name: 'billing', archivedAt: null }],
  runs: [run],
} as unknown as AppState;

beforeEach(() => {
  window.korev = { call, on: () => () => {} } as unknown as Window['korev'];
});

afterEach(() => {
  cleanup();
  call.mockClear();
});

describe('RunsPage', () => {
  it('shows a gated task as needing a decision and sends the choice', () => {
    render(<RunsPage state={state} />);

    expect(screen.getByText('Needs a decision')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'no' }));

    expect(call).toHaveBeenCalledWith('resolveGate', ['run-1', 'g1', 'no']);
  });
});
