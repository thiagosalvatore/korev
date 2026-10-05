import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DAY_MS, formatClock, formatWeekday } from './format';
import { SYNCED_AT, makeSnapshot } from './test-fixtures';
import { Topbar } from './Topbar';

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Topbar', () => {
  it('offers Reconnect GitHub when auth is lost', () => {
    const onReconnect = vi.fn();
    render(
      <Topbar
        title="My PRs"
        snapshot={makeSnapshot({ status: 'auth_lost' })}
        onReconnect={onReconnect}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect GitHub' }));
    expect(onReconnect).toHaveBeenCalledOnce();
  });

  it('shows when the offline data was synced', () => {
    vi.setSystemTime(SYNCED_AT);
    render(
      <Topbar
        title="My PRs"
        snapshot={makeSnapshot({ status: 'offline' })}
        onReconnect={vi.fn()}
      />,
    );
    expect(
      screen.getByText(`Offline · data from ${formatClock(SYNCED_AT)}`),
    ).toBeTruthy();
  });

  it('names the day of cached data from an earlier day while syncing', () => {
    vi.setSystemTime(new Date(Date.parse(SYNCED_AT) + 3 * DAY_MS));
    render(
      <Topbar
        title="My PRs"
        snapshot={makeSnapshot({ status: 'syncing', fromCache: true })}
        onReconnect={vi.fn()}
      />,
    );
    expect(
      screen.getByText(
        `Syncing… · data from ${formatWeekday(SYNCED_AT)} ${formatClock(SYNCED_AT)}`,
      ),
    ).toBeTruthy();
  });

  it('names why the sync failed', () => {
    render(
      <Topbar
        title="My PRs"
        snapshot={makeSnapshot({
          status: 'error',
          error: 'GitHub answered with HTTP 504',
        })}
        onReconnect={vi.fn()}
      />,
    );
    expect(
      screen.getByTitle('GitHub answered with HTTP 504').textContent,
    ).toContain('Sync failed');
  });
});
