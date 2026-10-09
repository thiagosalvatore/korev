import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Changelog from './page';

describe('changelog page', () => {
  it('lists releases newest first, each linkable by its tag', () => {
    render(<Changelog />);
    const releases = [...document.querySelectorAll('.cl-rel')];
    const dates = releases.map(
      (release) => release.querySelector('time')!.dateTime,
    );
    expect(dates).toEqual(dates.toSorted().reverse());
    expect(releases.at(-1)?.id).toBe('v0.1.0');
    expect(
      screen.getByRole('link', { name: 'v0.8.0' }).getAttribute('href'),
    ).toBe('#v0.8.0');
  });

  it('renders bold titles and code from the markdown', () => {
    render(<Changelog />);
    const firstRelease = document.getElementById('v0.1.0')!;
    expect(firstRelease.querySelector('strong')?.textContent).toBe(
      'Parallel agents.',
    );
    expect(firstRelease.querySelector('code')?.textContent).toBe(
      '.korev/settings.toml',
    );
  });
});
