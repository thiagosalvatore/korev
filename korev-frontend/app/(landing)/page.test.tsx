import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import Home from './page';

beforeAll(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});

afterEach(cleanup);

describe('landing page', () => {
  it('renders the hero and switches the demo scene from the strip', () => {
    render(<Home />);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Every task on its own branch.',
      }),
    ).toBeTruthy();
    expect(document.querySelector('.km-difftool')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Review the diff/ }));

    expect(document.querySelector('.km-difftool')).not.toBeNull();
  });

  it('shows the explainer among the features', () => {
    render(<Home />);
    expect(
      screen.getByRole('heading', {
        name: 'Understand a pull request before you review it.',
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', {
        name: 'Every pull request that needs you, in one table.',
      }),
    ).toBeTruthy();
  });

  it('shows starting a workspace from a korev:// link', () => {
    render(<Home />);
    const launch = screen.getByRole('region', { name: 'Launch' });
    expect(
      within(launch).getByRole('heading', {
        name: 'Start a task from any app.',
      }),
    ).toBeTruthy();
    expect(launch.textContent).toContain('korev://new-workspace');
  });
});
