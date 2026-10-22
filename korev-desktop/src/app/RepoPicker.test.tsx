import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppState, Repo, Workspace } from '../shared/model';
import { RepoPicker } from './RepoPicker';

afterEach(cleanup);

function repo(name: string): Repo {
  return {
    id: name,
    name,
    path: `/code/${name}`,
    defaultBranch: 'main',
    scripts: {} as Repo['scripts'],
  };
}

function pickerState(repos: Repo[], workspaces: Workspace[] = []): AppState {
  return { repos, workspaces, askChats: [] } as unknown as AppState;
}

describe('RepoPicker', () => {
  it('filters repositories by search and keeps the list open while toggling', () => {
    const onChange = vi.fn();
    const state = pickerState([
      repo('posthog'),
      repo('korev'),
      repo('posthog-js'),
    ]);
    render(
      <RepoPicker state={state} selected={['korev']} onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Repositories' }));
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Search repositories' }),
      {
        target: { value: 'POST' },
      },
    );

    expect(screen.queryByRole('checkbox', { name: 'korev' })).toBeNull();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);

    fireEvent.click(screen.getByRole('checkbox', { name: 'posthog-js' }));

    expect(onChange).toHaveBeenCalledWith(['korev', 'posthog-js']);
    expect(screen.getByRole('checkbox', { name: 'posthog' })).toBeTruthy();
  });

  it('toggles the highlighted repository with Space and keeps the list open', () => {
    const onChange = vi.fn();
    const state = pickerState([repo('posthog'), repo('korev')]);
    render(<RepoPicker state={state} selected={[]} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Repositories' }));
    const search = screen.getByRole('textbox', { name: 'Search repositories' });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: ' ' });

    expect(onChange).toHaveBeenCalledWith(['posthog']);
    expect(
      screen.getByRole('dialog', { name: 'Choose repositories' }),
    ).toBeTruthy();
  });

  it('picks the first match and closes on Enter when nothing is chosen', () => {
    const onChange = vi.fn();
    const state = pickerState([repo('posthog'), repo('korev')]);
    render(
      <RepoPicker
        state={state}
        selected={[]}
        onChange={onChange}
        defaultOpen
      />,
    );

    const search = screen.getByRole('textbox', { name: 'Search repositories' });
    fireEvent.change(search, { target: { value: 'kor' } });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith(['korev']);
    expect(
      screen.queryByRole('dialog', { name: 'Choose repositories' }),
    ).toBeNull();
  });

  it('lists recently used repositories first, marked Recent, then the rest by name', () => {
    const state = pickerState(
      [repo('posthog'), repo('zed'), repo('korev')],
      [{ repoId: 'zed', createdAt: '2026-01-01' } as Workspace],
    );
    render(
      <RepoPicker state={state} selected={[]} onChange={vi.fn()} defaultOpen />,
    );

    expect(
      screen
        .getAllByRole('checkbox')
        .map((box) => box.closest('label')?.textContent),
    ).toEqual(['zedRecent', 'korev', 'posthog']);
  });
});
