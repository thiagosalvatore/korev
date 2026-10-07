import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
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
});
