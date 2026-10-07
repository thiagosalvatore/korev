import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppState, Repo } from '../shared/model';
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

describe('RepoPicker', () => {
  it('filters repositories by search and keeps the list open while toggling', () => {
    const onChange = vi.fn();
    const state = {
      repos: [repo('posthog'), repo('korev'), repo('posthog-js')],
    } as AppState;
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
});
