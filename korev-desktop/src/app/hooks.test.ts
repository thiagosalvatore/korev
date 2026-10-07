import { renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { usePolling } from './hooks';

afterEach(() => {
  vi.useRealTimers();
});

it('runs the callback once and never again without an interval', () => {
  vi.useFakeTimers();
  const callback = vi.fn();

  renderHook(() => usePolling(callback, null, []));
  vi.advanceTimersByTime(60_000);

  expect(callback).toHaveBeenCalledTimes(1);
});
