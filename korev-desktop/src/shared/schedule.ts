import type { AutomationSchedule, TimeWindow, Weekday } from './model';

type IntervalSchedule = Extract<AutomationSchedule, { kind: 'interval' }>;
type TimesSchedule = Extract<AutomationSchedule, { kind: 'times' }>;

export const ALL_DAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];
export const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5];
const WEEKENDS: Weekday[] = [0, 6];
export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const MINUTE_MS = 60_000;
const MINUTES_PER_HOUR = 60;
const DAYS_SCANNED = 8;
const WHOLE_DAY: TimeWindow = { from: '00:00', until: '24:00' };
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const listFormat = new Intl.ListFormat('en', { type: 'conjunction' });

function atTime(day: Date, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const result = new Date(day);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function allowedDays(schedule: AutomationSchedule, from: Date): Date[] {
  return Array.from({ length: DAYS_SCANNED }, (_, offset) =>
    addDays(from, offset),
  ).filter((day) => schedule.days.includes(day.getDay() as Weekday));
}

function nextSetTime(schedule: TimesSchedule, after: Date): Date | null {
  for (const day of allowedDays(schedule, after)) {
    const slot = schedule.times
      .map((time) => atTime(day, time))
      .sort((a, b) => a.getTime() - b.getTime())
      .find((candidate) => candidate > after);
    if (slot) return slot;
  }
  return null;
}

function nextIntervalRun(
  schedule: IntervalSchedule,
  earliest: Date,
): Date | null {
  const window = schedule.window ?? WHOLE_DAY;
  for (const day of allowedDays(schedule, earliest)) {
    const start = atTime(day, window.from);
    const candidate = earliest > start ? earliest : start;
    if (candidate <= atTime(day, window.until)) return candidate;
  }
  return null;
}

export function nextRunAt(
  schedule: AutomationSchedule,
  lastRunAt: Date | null,
  createdAt: Date,
): Date | null {
  if (schedule.kind === 'times')
    return nextSetTime(schedule, lastRunAt ?? createdAt);
  const earliest = lastRunAt
    ? new Date(lastRunAt.getTime() + schedule.minutes * MINUTE_MS)
    : createdAt;
  return nextIntervalRun(schedule, earliest);
}

function sameDays(days: Weekday[], expected: Weekday[]): boolean {
  return (
    days.length === expected.length &&
    expected.every((day) => days.includes(day))
  );
}

function describeDays(days: Weekday[]): string {
  if (sameDays(days, ALL_DAYS)) return 'every day';
  if (sameDays(days, WEEKDAYS)) return 'weekdays';
  if (sameDays(days, WEEKENDS)) return 'weekends';
  return listFormat.format([...days].sort().map((day) => `${DAY_NAMES[day]}s`));
}

function plural(count: number, unit: string): string {
  return count === 1 ? unit : `${count} ${unit}s`;
}

function describeInterval(minutes: number): string {
  if (minutes % MINUTES_PER_HOUR === 0)
    return plural(minutes / MINUTES_PER_HOUR, 'hour');
  return plural(minutes, 'minute');
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function describeSchedule(schedule: AutomationSchedule): string {
  const days = describeDays(schedule.days);
  if (schedule.kind === 'times') {
    const times = listFormat.format([...schedule.times].sort());
    return `${capitalized(days)} at ${times}`;
  }
  const onDays = sameDays(schedule.days, ALL_DAYS) ? '' : ` on ${days}`;
  const window = schedule.window
    ? `, ${schedule.window.from}–${schedule.window.until}`
    : '';
  return `Every ${describeInterval(schedule.minutes)}${onDays}${window}`;
}

function clockTime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function relativeDay(date: Date, now: Date): string {
  if (date.toDateString() === now.toDateString()) return 'today';
  if (date.toDateString() === addDays(now, 1).toDateString()) return 'tomorrow';
  return date.toLocaleDateString('en', { weekday: 'short' });
}

export function formatNextRun(date: Date, now: Date): string {
  return `${relativeDay(date, now)} at ${clockTime(date)}`;
}

function timesError(times: string[]): string | null {
  if (!times.length) return 'Add at least one time';
  if (!times.every((time) => TIME_PATTERN.test(time)))
    return 'Times look like 09:00';
  return null;
}

function windowError(window: TimeWindow | null): string | null {
  if (!window) return null;
  const invalidTime = timesError([window.from, window.until]);
  if (invalidTime) return invalidTime;
  return window.from < window.until
    ? null
    : 'The time window has to end after it starts';
}

export function scheduleError(schedule: AutomationSchedule): string | null {
  if (!schedule.days.length) return 'Pick at least one day';
  if (schedule.kind === 'times') return timesError(schedule.times);
  if (!(Number.isInteger(schedule.minutes) && schedule.minutes >= 1))
    return 'An automation runs at most once a minute';
  return windowError(schedule.window);
}
