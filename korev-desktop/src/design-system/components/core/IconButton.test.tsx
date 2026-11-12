import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IconButton } from './IconButton';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('IconButton tooltip', () => {
  it('shows its tooltip after the pointer rests on it, and hides it when the pointer leaves', () => {
    render(
      <IconButton
        icon="book-open"
        label="Explain"
        title="Walk through what this pull request changes"
      />,
    );
    const button = screen.getByRole('button', { name: 'Explain' });

    fireEvent.pointerEnter(button);
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => vi.advanceTimersByTime(600));
    expect(screen.getByRole('tooltip').textContent).toBe(
      'Walk through what this pull request changes',
    );

    fireEvent.pointerLeave(button);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('shows the label on keyboard focus when there is no title', () => {
    render(<IconButton icon="refresh-cw" label="Refresh" />);
    const button = screen.getByRole('button', { name: 'Refresh' });

    fireEvent.focus(button);
    act(() => vi.advanceTimersByTime(600));
    expect(screen.getByRole('tooltip').textContent).toBe('Refresh');

    fireEvent.keyDown(button, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('keeps the native tooltip while disabled, since disabled buttons get no pointer events', () => {
    render(
      <IconButton
        icon="refresh-cw"
        label="Refresh"
        title="Load again"
        disabled
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Refresh' }).getAttribute('title'),
    ).toBe('Load again');
  });

  it('hides the tooltip when clicked', () => {
    render(<IconButton icon="refresh-cw" label="Refresh" />);
    const button = screen.getByRole('button', { name: 'Refresh' });

    fireEvent.pointerEnter(button);
    act(() => vi.advanceTimersByTime(600));
    fireEvent.pointerDown(button);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
