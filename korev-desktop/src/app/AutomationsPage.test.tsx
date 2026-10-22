import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState, Automation } from '../shared/model';
import { AutomationsPage } from './AutomationsPage';
import { resetUiForTests } from './ui-store';

const automation: Automation = {
  id: 'au1',
  name: 'Support tickets',
  prompt: 'Sweep my tickets',
  intervalMinutes: 10,
  repoIds: ['r1'],
  enabled: true,
  createdAt: '2026-01-01T00:00:00Z',
  lastRunAt: '2026-01-01T00:10:00Z',
  usedKeys: ['T-1'],
};

const state = {
  repos: [{ id: 'r1', name: 'acme' }],
  workspaces: [
    {
      id: 'w1',
      repoId: 'r1',
      name: 'fix-t-1',
      branch: 'fix-t-1',
      createdAt: '2026-01-01T00:11:00Z',
      sessions: [],
    },
  ],
  askChats: [
    {
      id: 'a1',
      repoIds: [],
      session: { id: 'as1', title: 'Support tickets', agent: 'claude' },
      createdAt: '2026-01-01T00:10:00Z',
      lastMessageAt: '2026-01-01T00:10:00Z',
      automationRun: {
        automationId: 'au1',
        workspaceIds: ['w1'],
        notes: [
          "Skipped T-2: elsewhere is not one of this automation's repositories.",
        ],
      },
    },
  ],
  automations: [automation],
  runningSessions: [],
} as unknown as AppState;

afterEach(() => {
  cleanup();
  resetUiForTests();
});

beforeEach(() => {
  window.korev = {
    call: vi.fn(async () => null),
    on: () => () => {},
  } as unknown as Window['korev'];
});

describe('AutomationsPage', () => {
  it('creates an automation from the form', () => {
    render(<AutomationsPage state={{ ...state, automations: [] }} />);

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Triage' },
    });
    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: 'Read my new tickets' },
    });
    fireEvent.change(screen.getByLabelText('Every (minutes)'), {
      target: { value: '15' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create automation' }));

    expect(window.korev.call).toHaveBeenCalledWith('createAutomation', [
      {
        name: 'Triage',
        prompt: 'Read my new tickets',
        intervalMinutes: 15,
        repoIds: [],
        enabled: true,
      },
    ]);
  });

  it('shows what each run did', () => {
    render(<AutomationsPage state={state} />);

    expect(screen.getByText('Opened 1 workspace')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'fix-t-1' })).toBeTruthy();
    expect(screen.getByText(/elsewhere is not one/)).toBeTruthy();
  });
});
