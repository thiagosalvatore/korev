import { describe, expect, it } from 'vitest';
import { createIdleWatch, type Activity } from './idle-exit';

const LIMIT_MS = 15 * 60_000;
const IDLE: Activity = { runningAgents: 0, connectedDevices: 0 };

function clock() {
  let time = 0;
  return {
    now: () => time,
    advance(ms: number) {
      time += ms;
    },
  };
}

describe('idle watch', () => {
  it('exits once nothing has happened for the whole limit', () => {
    const time = clock();
    const watch = createIdleWatch(LIMIT_MS, time.now);

    time.advance(LIMIT_MS - 1);
    expect(watch.shouldExit(IDLE)).toBe(false);
    time.advance(1);
    expect(watch.shouldExit(IDLE)).toBe(true);
  });

  it.each([
    ['an agent runs', { runningAgents: 1, connectedDevices: 0 }],
    ['a client is connected', { runningAgents: 0, connectedDevices: 1 }],
  ])('stays up while %s and restarts the idle clock after', (_, busy) => {
    const time = clock();
    const watch = createIdleWatch(LIMIT_MS, time.now);

    time.advance(LIMIT_MS);
    expect(watch.shouldExit(busy)).toBe(false);
    time.advance(LIMIT_MS - 1);
    expect(watch.shouldExit(IDLE)).toBe(false);
  });
});
