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
  it('starts with no repository chosen when several exist', () => {
    render(
      <NewWorkspacePage
        state={stateWith([repo('korev'), repo('posthog')])}
        repoId={null}
      />,
    );
    expect(repoPicker().textContent).toBe('Choose repositories');
  });

  it('preselects the only repository', () => {
    render(
      <NewWorkspacePage state={stateWith([repo('korev')])} repoId={null} />,
    );
    expect(repoPicker().textContent).toBe('korev');
  });

  it('keeps the typed task when a repository is picked afterwards', () => {
    render(
      <NewWorkspacePage
        state={stateWith([repo('korev'), repo('posthog')])}
        repoId={null}
      />,
    );
    const message = screen.getByRole('textbox', { name: 'Message' });
    fireEvent.change(message, { target: { value: 'Add a note' } });
    fireEvent.keyDown(message, { key: 'Enter' });
    fireEvent.click(repoPicker());
    fireEvent.click(screen.getByRole('checkbox', { name: 'posthog' }));
    expect(
      (screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement)
        .value,
    ).toBe('Add a note');
  });
});
