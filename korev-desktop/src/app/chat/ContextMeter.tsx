import { useCallback, useRef, useState } from 'react';
import { cn } from '../../design-system';
import type { ContextUsage, PlanLimit } from '../../shared/model';
import { formatTokens } from '../format';
import { PANEL, useDismiss } from '../ui/Menu';

const SIZE = 16;
const STROKE = 2;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const PERCENT = 100;
const WARNING_PERCENT = 80;
const DANGER_PERCENT = 95;
const RESET_FORMAT: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

const UNKNOWN_PERCENT = '—';

export interface ContextMeterProps {
  context: ContextUsage | null;
  limits: PlanLimit[];
}

function arcColor(percent: number): string {
  if (percent >= DANGER_PERCENT) return 'text-danger';
  if (percent >= WARNING_PERCENT) return 'text-warning';
  return 'text-fg-3';
}

function isCurrent(limit: PlanLimit, now: number): boolean {
  return limit.resetsAt === null || limit.resetsAt > now;
}

function UsageBar({ percent, label }: { percent: number; label: string }) {
  const clamped = Math.min(PERCENT, percent);
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={PERCENT}
      className="h-1.5 overflow-hidden rounded-full bg-border-2"
    >
      <div
        className={cn('h-full rounded-full bg-current', arcColor(clamped))}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

function PendingContextSection() {
  return (
    <section className="flex flex-col gap-2">
      <div className="type-overline text-fg-4">Context window</div>
      <div className="text-xs text-fg-3">Appears after the first reply</div>
    </section>
  );
}

function ContextSection({
  context,
  percent,
}: {
  context: ContextUsage;
  percent: number;
}) {
  const left = Math.max(0, context.windowTokens - context.usedTokens);
  return (
    <section className="flex flex-col gap-2">
      <div className="type-overline text-fg-4">Context window</div>
      <div className="flex items-baseline gap-2">
        <span className="type-h3 text-fg-1">{Math.round(percent)}%</span>
        <span className="text-xs text-fg-3">
          {formatTokens(context.usedTokens)} of{' '}
          {formatTokens(context.windowTokens)} tokens
        </span>
      </div>
      <UsageBar percent={percent} label="Context used" />
      <div className="text-2xs text-fg-4">{formatTokens(left)} left</div>
    </section>
  );
}

function LimitRow({ limit }: { limit: PlanLimit }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-fg-2">{limit.label}</span>
        <span className="text-fg-1 tabular-nums">
          {Math.round(limit.usedPercent)}%
        </span>
      </div>
      <UsageBar percent={limit.usedPercent} label={`${limit.label} used`} />
      {limit.resetsAt === null ? null : (
        <div className="text-2xs text-fg-4">
          Resets {new Date(limit.resetsAt).toLocaleString([], RESET_FORMAT)}
        </div>
      )}
    </div>
  );
}

function LimitsSection({ limits }: { limits: PlanLimit[] }) {
  return (
    <section className="mt-3 flex flex-col gap-3 border-t border-border-1 pt-3">
      <div className="type-overline text-fg-4">Plan limits</div>
      {limits.map((limit) => (
        <LimitRow key={limit.label} limit={limit} />
      ))}
    </section>
  );
}

function Ring({ percent }: { percent: number }) {
  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="-rotate-90"
    >
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        fill="none"
        strokeWidth={STROKE}
        className="stroke-border-2"
      />
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        fill="none"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={CIRCUMFERENCE * (1 - percent / PERCENT)}
        className={cn('stroke-current', arcColor(percent))}
      />
    </svg>
  );
}

export function ContextMeter({ context, limits }: ContextMeterProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(root, open, close);
  const percent = context
    ? Math.min(PERCENT, (context.usedTokens / context.windowTokens) * PERCENT)
    : 0;
  const now = Date.now();
  const currentLimits = limits.filter((limit) => isCurrent(limit, now));
  return (
    <div ref={root} className="relative mr-1 inline-flex">
      <button
        type="button"
        aria-label="Context usage"
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          'flex h-7 cursor-pointer items-center gap-1 rounded-sm border-0 bg-transparent px-1 text-2xs text-fg-4 hover:bg-hover hover:text-fg-2',
          open && 'bg-hover text-fg-2',
        )}
        onClick={() => setOpen((value) => !value)}
      >
        <Ring percent={percent} />
        {context ? `${Math.round(percent)}%` : UNKNOWN_PERCENT}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Usage"
          className={cn(PANEL, 'right-0 bottom-[calc(100%+4px)] w-72 p-3')}
        >
          {context ? (
            <ContextSection context={context} percent={percent} />
          ) : (
            <PendingContextSection />
          )}
          {currentLimits.length ? (
            <LimitsSection limits={currentLimits} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
