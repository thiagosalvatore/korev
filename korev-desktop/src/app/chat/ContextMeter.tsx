import { cn } from '../../design-system';
import type { ContextUsage, PlanLimit } from '../../shared/model';
import { formatTokens } from '../format';

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

export interface ContextMeterProps {
  context: ContextUsage;
  limits: PlanLimit[];
}

function arcColor(percent: number): string {
  if (percent >= DANGER_PERCENT) return 'text-danger';
  if (percent >= WARNING_PERCENT) return 'text-warning';
  return 'text-fg-3';
}

function contextLine({ usedTokens, windowTokens }: ContextUsage): string {
  const percent = Math.round((usedTokens / windowTokens) * PERCENT);
  const left = Math.max(0, windowTokens - usedTokens);
  return `Context: ${formatTokens(usedTokens)} of ${formatTokens(windowTokens)} tokens (${percent}%) · ${formatTokens(left)} left`;
}

function limitLine(limit: PlanLimit): string {
  const used = `${limit.label}: ${Math.round(limit.usedPercent)}% used`;
  if (limit.resetsAt === null) return used;
  const resets = new Date(limit.resetsAt).toLocaleString([], RESET_FORMAT);
  return `${used} · resets ${resets}`;
}

function isCurrent(limit: PlanLimit, now: number): boolean {
  return limit.resetsAt === null || limit.resetsAt > now;
}

export function ContextMeter({ context, limits }: ContextMeterProps) {
  const percent = Math.min(
    PERCENT,
    (context.usedTokens / context.windowTokens) * PERCENT,
  );
  const now = Date.now();
  const title = [
    contextLine(context),
    ...limits.filter((limit) => isCurrent(limit, now)).map(limitLine),
  ].join('\n');
  return (
    <span
      role="meter"
      aria-label="Context used"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={PERCENT}
      title={title}
      className="mr-1 flex h-7 cursor-default items-center gap-1 px-1 text-2xs text-fg-4"
    >
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
      {Math.round(percent)}%
    </span>
  );
}
