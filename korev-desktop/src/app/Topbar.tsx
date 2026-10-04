import type { ReactNode } from 'react';
import { Button, Icon, IconButton, Kbd, cn } from '../design-system';
import type { InboxSnapshot } from '../shared/inbox';
import { formatClock, formatDataTime, formatSynced } from './format';
import { DRAG_REGION, NO_DRAG } from './layout';
import { refreshInbox } from './useInboxSnapshot';
import { MINUTE_MS, useNow } from './useNow';

type StatusTone = 'quiet' | 'warning' | 'danger';

const STATUS_TONES: Record<StatusTone, string> = {
  quiet: 'text-fg-3',
  warning: 'text-warning-text',
  danger: 'text-danger-text',
};

function StatusText({
  tone = 'quiet',
  children,
}: {
  tone?: StatusTone;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs whitespace-nowrap',
        STATUS_TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

const HINT_KEYS = ['J', 'K', '↵', '?'];

function withTime(label: string, iso: string | null, prefix: string): string {
  if (!iso) return label;
  return `${label} · ${prefix} ${formatClock(iso)}`;
}

function withDataTime(label: string, iso: string | null, now: number): string {
  if (!iso) return label;
  return `${label} · data from ${formatDataTime(iso, now)}`;
}

function cachedDataTime(snapshot: InboxSnapshot): string | null {
  return snapshot.fromCache ? snapshot.syncedAt : null;
}

interface SyncStatusProps {
  snapshot: InboxSnapshot;
  onReconnect: () => void;
}

function SyncStatus({ snapshot, onReconnect }: SyncStatusProps) {
  const now = useNow(MINUTE_MS);
  switch (snapshot.status) {
    case 'syncing':
      return (
        <StatusText>
          <Icon
            name="loader-circle"
            size={13}
            className="animate-spin motion-reduce:animate-none"
          />
          {withDataTime('Syncing…', cachedDataTime(snapshot), now)}
        </StatusText>
      );
    case 'error':
      return (
        <StatusText tone="danger">
          Sync failed ·
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void refreshInbox()}
            className={NO_DRAG}
          >
            Retry
          </Button>
        </StatusText>
      );
    case 'rate_limited':
      return (
        <StatusText tone="warning">
          {withTime('Rate limited', snapshot.rateLimitResetAt, 'resumes')}
        </StatusText>
      );
    case 'offline':
      return (
        <StatusText tone="warning">
          {withDataTime('Offline', snapshot.syncedAt, now)}
        </StatusText>
      );
    case 'paused':
      return <StatusText>Paused</StatusText>;
    case 'auth_lost':
      return (
        <Button
          size="sm"
          variant="danger"
          onClick={onReconnect}
          className={NO_DRAG}
        >
          Reconnect GitHub
        </Button>
      );
    default:
      if (!snapshot.syncedAt) return null;
      return <StatusText>{formatSynced(snapshot.syncedAt, now)}</StatusText>;
  }
}

function KeyHints({ onShowShortcuts }: { onShowShortcuts: () => void }) {
  return (
    <button
      type="button"
      aria-label="Keyboard shortcuts"
      title="Keyboard shortcuts"
      onClick={onShowShortcuts}
      className={cn(
        'hidden cursor-pointer items-center gap-1 rounded-sm border-0 bg-transparent p-1 hover:bg-hover focus-visible:shadow-focus min-[900px]:inline-flex',
        NO_DRAG,
      )}
    >
      {HINT_KEYS.map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
    </button>
  );
}

export interface TopbarProps {
  title: string;
  subtitle?: string;
  filter?: ReactNode;
  snapshot: InboxSnapshot | null;
  onReconnect: () => void;
  onShowShortcuts?: () => void;
}

export function Topbar({
  title,
  subtitle,
  filter,
  snapshot,
  onReconnect,
  onShowShortcuts,
}: TopbarProps) {
  return (
    <header
      className={cn(
        'flex h-topbar shrink-0 items-center gap-2.5 border-b border-border-1 pr-4 pl-5',
        DRAG_REGION,
      )}
    >
      <h1 className="m-0 truncate type-h3 text-fg-1">{title}</h1>
      {filter}
      {subtitle ? (
        <span className="truncate text-xs text-fg-3">{subtitle}</span>
      ) : null}
      <span className="flex-1" />
      <span className="inline-flex">
        {snapshot ? (
          <SyncStatus snapshot={snapshot} onReconnect={onReconnect} />
        ) : null}
      </span>
      <IconButton
        icon="refresh-cw"
        label="Refresh"
        variant="secondary"
        size="sm"
        onClick={() => void refreshInbox()}
        className={NO_DRAG}
      />
      {onShowShortcuts ? <KeyHints onShowShortcuts={onShowShortcuts} /> : null}
    </header>
  );
}
