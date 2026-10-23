import { useState } from 'react';
import {
  Button,
  IconButton,
  Input,
  Select,
  Switch,
  Tabs,
} from '../design-system';
import type { AutomationSchedule, TimeWindow, Weekday } from '../shared/model';
import {
  DAY_NAMES,
  describeSchedule,
  formatNextRun,
  nextRunAt,
  scheduleError,
} from '../shared/schedule';

type Kind = AutomationSchedule['kind'];
type IntervalSchedule = Extract<AutomationSchedule, { kind: 'interval' }>;
type TimesSchedule = Extract<AutomationSchedule, { kind: 'times' }>;
type Unit = 'minutes' | 'hours';

const MINUTES_PER_HOUR = 60;
const UNIT_MINUTES: Record<Unit, number> = {
  minutes: 1,
  hours: MINUTES_PER_HOUR,
};
const DEFAULT_MINUTES = 10;
const DEFAULT_TIME = '09:00';
const DEFAULT_WINDOW: TimeWindow = { from: '09:00', until: '18:00' };
const MONDAY_FIRST: Weekday[] = [1, 2, 3, 4, 5, 6, 0];
const KIND_TABS: { id: Kind; label: string }[] = [
  { id: 'interval', label: 'Repeat' },
  { id: 'times', label: 'At set times' },
];
const UNIT_OPTIONS = [
  { value: 'minutes', label: 'minutes' },
  { value: 'hours', label: 'hours' },
];

function switchedKind(
  schedule: AutomationSchedule,
  kind: Kind,
): AutomationSchedule {
  if (kind === schedule.kind) return schedule;
  if (kind === 'times')
    return { kind, times: [DEFAULT_TIME], days: schedule.days };
  return {
    kind,
    minutes: DEFAULT_MINUTES,
    days: schedule.days,
    window: null,
  };
}

function toggled(days: Weekday[], day: Weekday): Weekday[] {
  return days.includes(day)
    ? days.filter((entry) => entry !== day)
    : [...days, day].sort();
}

function initialUnit(minutes: number): Unit {
  return minutes >= MINUTES_PER_HOUR && minutes % MINUTES_PER_HOUR === 0
    ? 'hours'
    : 'minutes';
}

function IntervalFields({
  schedule,
  onChange,
}: {
  schedule: IntervalSchedule;
  onChange(schedule: IntervalSchedule): void;
}) {
  const [unit, setUnit] = useState(initialUnit(schedule.minutes));
  const [amount, setAmount] = useState(
    String(schedule.minutes / UNIT_MINUTES[unit]),
  );

  function update(nextAmount: string, nextUnit: Unit) {
    setAmount(nextAmount);
    setUnit(nextUnit);
    onChange({
      ...schedule,
      minutes: Number(nextAmount) * UNIT_MINUTES[nextUnit],
    });
  }

  function updateWindow(window: Partial<TimeWindow>) {
    onChange({
      ...schedule,
      window: { ...DEFAULT_WINDOW, ...schedule.window, ...window },
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-fg-2">Every</span>
      <Input
        aria-label="Repeat every"
        type="number"
        min={1}
        value={amount}
        className="w-20"
        onChange={(event) => update(event.target.value, unit)}
      />
      <Select
        ariaLabel="Unit"
        options={UNIT_OPTIONS}
        value={unit}
        className="w-28"
        onChange={(value) => update(amount, value as Unit)}
      />
      <Switch
        label="Only between"
        className="ml-3"
        checked={schedule.window !== null}
        onChange={(on) =>
          onChange({ ...schedule, window: on ? DEFAULT_WINDOW : null })
        }
      />
      {schedule.window ? (
        <>
          <Input
            aria-label="From"
            type="time"
            value={schedule.window.from}
            className="w-28"
            onChange={(event) => updateWindow({ from: event.target.value })}
          />
          <span className="text-sm text-fg-3">and</span>
          <Input
            aria-label="Until"
            type="time"
            value={schedule.window.until}
            className="w-28"
            onChange={(event) => updateWindow({ until: event.target.value })}
          />
        </>
      ) : null}
    </div>
  );
}

function TimesFields({
  schedule,
  onChange,
}: {
  schedule: TimesSchedule;
  onChange(schedule: TimesSchedule): void;
}) {
  const setTimes = (times: string[]) => onChange({ ...schedule, times });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {schedule.times.map((time, index) => (
        <Input
          key={index}
          aria-label={`Time ${index + 1}`}
          type="time"
          value={time}
          className="w-36"
          onChange={(event) =>
            setTimes(schedule.times.with(index, event.target.value))
          }
          suffix={
            schedule.times.length > 1 ? (
              <IconButton
                size="sm"
                icon="x"
                label={`Remove ${time}`}
                onClick={() => setTimes(schedule.times.toSpliced(index, 1))}
              />
            ) : null
          }
        />
      ))}
      <Button
        size="sm"
        variant="ghost"
        icon="plus"
        onClick={() => setTimes([...schedule.times, DEFAULT_TIME])}
      >
        Add time
      </Button>
    </div>
  );
}

function DayPicker({
  days,
  onChange,
}: {
  days: Weekday[];
  onChange(days: Weekday[]): void;
}) {
  return (
    <div className="flex items-center gap-1">
      {MONDAY_FIRST.map((day) => (
        <button
          key={day}
          type="button"
          aria-label={DAY_NAMES[day]}
          title={DAY_NAMES[day]}
          aria-pressed={days.includes(day)}
          className="size-control-md cursor-pointer rounded-full border border-border-2 bg-inset text-xs font-medium text-fg-3 transition-colors duration-(--dur-fast) ease-out not-aria-pressed:hover:border-border-strong not-aria-pressed:hover:text-fg-1 focus-visible:shadow-focus aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-fg-on-accent"
          onClick={() => onChange(toggled(days, day))}
        >
          {DAY_NAMES[day].charAt(0)}
        </button>
      ))}
    </div>
  );
}

function ScheduleSummary({ schedule }: { schedule: AutomationSchedule }) {
  const error = scheduleError(schedule);
  if (error) return <p className="m-0 text-xs text-danger-text">{error}</p>;
  const now = new Date();
  const next = nextRunAt(schedule, null, now);
  return (
    <p className="m-0 text-xs text-fg-3">
      {describeSchedule(schedule)}
      {next ? ` · Next run ${formatNextRun(next, now)}` : ''}
    </p>
  );
}

export function ScheduleField({
  schedule,
  onChange,
}: {
  schedule: AutomationSchedule;
  onChange(schedule: AutomationSchedule): void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="type-label text-fg-2">Schedule</span>
      <Tabs
        variant="pill"
        tabs={KIND_TABS}
        value={schedule.kind}
        onChange={(kind) => onChange(switchedKind(schedule, kind as Kind))}
      />
      {schedule.kind === 'interval' ? (
        <IntervalFields schedule={schedule} onChange={onChange} />
      ) : (
        <TimesFields schedule={schedule} onChange={onChange} />
      )}
      <div className="flex items-center gap-3">
        <span className="text-sm text-fg-2">On</span>
        <DayPicker
          days={schedule.days}
          onChange={(days) => onChange({ ...schedule, days })}
        />
      </div>
      <ScheduleSummary schedule={schedule} />
    </div>
  );
}
