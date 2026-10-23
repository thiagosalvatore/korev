import { describe, expect, it } from 'vitest';
import type { AutomationSchedule } from './model';
import {
  ALL_DAYS,
  describeSchedule,
  formatNextRun,
  nextRunAt,
  scheduleError,
  WEEKDAYS,
} from './schedule';

const friday = (hours: number, minutes = 0) =>
  new Date(2026, 9, 23, hours, minutes);
const monday = (hours: number, minutes = 0) =>
  new Date(2026, 9, 26, hours, minutes);

const workHours: AutomationSchedule = {
  kind: 'interval',
  minutes: 10,
  days: WEEKDAYS,
  window: { from: '09:00', until: '18:00' },
};

const twiceOnWeekdays: AutomationSchedule = {
  kind: 'times',
  times: ['17:30', '09:00'],
  days: WEEKDAYS,
};

describe('nextRunAt', () => {
  it('runs a new interval automation at once', () => {
    const schedule: AutomationSchedule = {
      kind: 'interval',
      minutes: 10,
      days: ALL_DAYS,
      window: null,
    };
    expect(nextRunAt(schedule, null, friday(3))).toEqual(friday(3));
  });

  it('repeats after the interval inside the window', () => {
    expect(nextRunAt(workHours, friday(12), friday(8))).toEqual(friday(12, 10));
  });

  it('moves a run past the window to the next allowed day', () => {
    expect(nextRunAt(workHours, friday(17, 55), friday(8))).toEqual(monday(9));
  });

  it('picks the next set time after the last run', () => {
    expect(nextRunAt(twiceOnWeekdays, friday(9), friday(8))).toEqual(
      friday(17, 30),
    );
    expect(nextRunAt(twiceOnWeekdays, friday(17, 30), friday(8))).toEqual(
      monday(9),
    );
  });

  it('skips a set time that passed before the automation was created', () => {
    expect(nextRunAt(twiceOnWeekdays, null, friday(18))).toEqual(monday(9));
  });

  it('runs once after Korev was quit for a week, then waits for the next slot', () => {
    const lastWeek = new Date(2026, 9, 16, 9);
    expect(
      nextRunAt(twiceOnWeekdays, lastWeek, lastWeek)!.getTime(),
    ).toBeLessThan(monday(12).getTime());
    expect(nextRunAt(twiceOnWeekdays, monday(12), lastWeek)).toEqual(
      monday(17, 30),
    );
  });
});

describe('describeSchedule', () => {
  it.each<[AutomationSchedule, string]>([
    [workHours, 'Every 10 minutes on weekdays, 09:00–18:00'],
    [
      { kind: 'interval', minutes: 120, days: ALL_DAYS, window: null },
      'Every 2 hours',
    ],
    [{ kind: 'times', times: ['09:00'], days: ALL_DAYS }, 'Every day at 09:00'],
    [{ kind: 'times', times: ['10:00'], days: [1] }, 'Mondays at 10:00'],
    [twiceOnWeekdays, 'Weekdays at 09:00 and 17:30'],
  ])('describes %j', (schedule, description) => {
    expect(describeSchedule(schedule)).toBe(description);
  });
});

describe('formatNextRun', () => {
  it('names the day relative to now', () => {
    expect(formatNextRun(friday(17, 30), friday(9))).toBe('today at 17:30');
    expect(formatNextRun(new Date(2026, 9, 24, 9), friday(9))).toBe(
      'tomorrow at 09:00',
    );
    expect(formatNextRun(monday(9), friday(9))).toBe('Mon at 09:00');
  });
});

describe('scheduleError', () => {
  it('rejects a window that ends before it starts', () => {
    expect(
      scheduleError({
        ...workHours,
        window: { from: '18:00', until: '09:00' },
      }),
    ).toBeTruthy();
    expect(scheduleError(workHours)).toBeNull();
  });
});
