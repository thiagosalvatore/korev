import { describe, expect, it } from 'vitest';
import { createIdleWatch, type Activity, type IdleWatch } from './idle-exit';

const CHECK_MS = 60_000;
const LIMIT_MS = 15 * CHECK_MS;
const FROZEN_FOR_MS = 60 * CHECK_MS;
const IDLE: Activity = { runningAgents: 0, connectedDevices: 0 };

function watchWithClock() {
  let time = 0;
  const watch = createIdleWatch({
    limitMs: LIMIT_MS,
    checkIntervalMs: CHECK_MS,
    now: () => time,
  });
  return {
    watch,
    freeze(ms: number) {
      time += ms;
    },
    checkFor(ms: number, activity: Activity): boolean {
      let idle = false;
      for (let waited = 0; waited < ms; waited += CHECK_MS) {
        time += CHECK_MS;
        idle = watch.idleTooLong(activity);
      }
      return idle;
    },
  };
}

function lastCheck(machine: { watch: IdleWatch }): boolean {
  return machine.watch.idleTooLong(IDLE);
}

describe('idle watch', () => {
  it('reports idle once nothing has happened for the whole limit', () => {
    const machine = watchWithClock();

    expect(machine.checkFor(LIMIT_MS - CHECK_MS, IDLE)).toBe(false);
    expect(machine.checkFor(CHECK_MS, IDLE)).toBe(true);
  });

  it.each([
    ['an agent runs', { runningAgents: 1, connectedDevices: 0 }],
    ['a client is connected', { runningAgents: 0, connectedDevices: 1 }],
  ])('stays busy while %s and restarts the idle clock after', (_, busy) => {
    const machine = watchWithClock();

    expect(machine.checkFor(LIMIT_MS, busy)).toBe(false);
    expect(machine.checkFor(LIMIT_MS - CHECK_MS, IDLE)).toBe(false);
  });

  it('restarts the idle clock when the machine was frozen between checks', () => {
    const machine = watchWithClock();
    machine.checkFor(LIMIT_MS - CHECK_MS, IDLE);

    machine.freeze(FROZEN_FOR_MS);

    expect(lastCheck(machine)).toBe(false);
    expect(machine.checkFor(LIMIT_MS - CHECK_MS, IDLE)).toBe(false);
    expect(machine.checkFor(CHECK_MS, IDLE)).toBe(true);
  });
});
