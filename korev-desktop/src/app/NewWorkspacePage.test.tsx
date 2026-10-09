import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState, Repo } from '../shared/model';
import { NewWorkspacePage } from './NewWorkspacePage';
import { resetUiForTests } from './ui-store';

afterEach(() => {
  cleanup();
  resetUiForTests();
  localStorage.clear();
});

beforeEach(() => {
  window.korev = {
    call: vi.fn(async () => null),
    on: () => () => {},
  } as unknown as Window['korev'];
});

function repo(name: string): Repo {
  return {
    id: name,
    name,
    path: `/code/${name}`,
    defaultBranch: 'main',
    scripts: {} as Repo['scripts'],
  };
}

function stateWith(repos: Repo[]): AppState {
  return {
    repos,
    workspaces: [],
    agents: [],
    settings: {
      defaultAgent: 'claude',
      defaultModels: { claude: 'opus' },
      defaultEffort: { claude: 'high' },
      defaultPlanMode: false,
      loadout: [],
      snippets: [],
    },
  } as unknown as AppState;
}

function repoPicker() {
  return screen.getByRole('button', { name: 'Repositories' });
}

describe('NewWorkspacePage', () => {
  it('starts with no repository chosen and the repository search focused when several exist', () => {
    render(
      <NewWorkspacePage
        state={stateWith([repo('korev'), repo('posthog')])}
        repoId={null}
      />,
    );
    expect(repoPicker().textContent).toBe('Choose repositories');
    expect(document.activeElement).toBe(
      screen.getByRole('textbox', { name: 'Search repositories' }),
    );
  });

  it('preselects the only repository and focuses the message', () => {
    render(
      <NewWorkspacePage state={stateWith([repo('korev')])} repoId={null} />,
    );
    expect(repoPicker().textContent).toBe('korev');
    expect(
      screen.queryByRole('textbox', { name: 'Search repositories' }),
    ).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole('textbox', { name: 'Message' }),
    );
  });

  it('keeps the typed task when a repository is picked afterwards', async () => {
    render(
      <NewWorkspacePage
        state={stateWith([repo('korev'), repo('posthog')])}
        repoId={null}
      />,
    );
    const message = screen.getByRole('textbox', { name: 'Message' });
    fireEvent.change(message, { target: { value: 'Add a note' } });
    fireEvent.keyDown(message, { key: 'Enter' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'posthog' }));
    expect(await screen.findByDisplayValue('Add a note')).toBe(
      screen.getByRole('textbox', { name: 'Message' }),
    );
  });

  it('starts in plan mode while several repositories are picked', () => {
    render(
      <NewWorkspacePage
        state={stateWith([repo('korev'), repo('posthog')])}
        repoId={null}
      />,
    );
    const planChip = () => screen.queryByRole('button', { name: 'Plan mode' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'korev' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'posthog' }));
    expect(planChip()).not.toBeNull();

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Message' }), {
      key: 'Tab',
      shiftKey: true,
    });
    expect(planChip()).not.toBeNull();

    fireEvent.click(screen.getByRole('checkbox', { name: 'posthog' }));
    expect(planChip()).toBeNull();
  });
});
