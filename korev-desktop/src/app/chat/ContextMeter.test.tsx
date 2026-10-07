import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ContextMeter } from './ContextMeter';

afterEach(cleanup);

const HOUR_MS = 3_600_000;

describe('ContextMeter', () => {
  it('opens a usage popover on click with current limits only, and closes on Escape', () => {
    render(
      <ContextMeter
        context={{ usedTokens: 50_000, windowTokens: 200_000 }}
        limits={[
          { label: '5-hour', usedPercent: 42, resetsAt: Date.now() + HOUR_MS },
          { label: 'Weekly', usedPercent: 90, resetsAt: Date.now() - HOUR_MS },
        ]}
      />,
    );

    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Context usage' }));

    const dialog = screen.getByRole('dialog', { name: 'Usage' });
    expect(dialog.textContent).toContain('50k of 200k tokens');
    expect(dialog.textContent).toContain('150k left');
    expect(dialog.textContent).toContain('5-hour');
    expect(dialog.textContent).not.toContain('Weekly');

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows plan limits before the first reply reports context usage', () => {
    render(
      <ContextMeter
        context={null}
        limits={[{ label: '5-hour', usedPercent: 42, resetsAt: null }]}
      />,
    );

    const button = screen.getByRole('button', { name: 'Context usage' });
    expect(button.textContent).toBe('—');

    fireEvent.click(button);

    const dialog = screen.getByRole('dialog', { name: 'Usage' });
    expect(dialog.textContent).toContain('Appears after the first reply');
    expect(dialog.textContent).toContain('5-hour');
  });
});
