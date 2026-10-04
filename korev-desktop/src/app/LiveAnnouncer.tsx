import { useState, useSyncExternalStore } from 'react';
import type { InboxSnapshot, SyncStatus } from '../shared/inbox';
import type { PrActionState } from '../shared/merge';
import { pluralize } from './format';
import { prRef } from '../shared/pr-ref';
import { requestedItems } from './inbox/selectors';

const QUIET_STATUSES: SyncStatus[] = ['idle', 'syncing'];
const HEALTHY_STATUS: SyncStatus = 'live';

const STATUS_MESSAGES: Partial<Record<SyncStatus, string>> = {
  live: 'Synced',
  paused: 'Sync paused',
  offline: 'Offline',
  rate_limited: 'Rate limited',
  auth_lost: 'GitHub access was revoked',
  error: 'Sync failed',
};

interface Tracked {
  snapshot: InboxSnapshot | null;
  settled: SyncStatus | null;
  message: string;
}

function settledStatus(
  previous: SyncStatus | null,
  snapshot: InboxSnapshot | null,
): SyncStatus | null {
  if (!snapshot || QUIET_STATUSES.includes(snapshot.status)) return previous;
  return snapshot.status;
}

function statusMessage(
  previous: SyncStatus | null,
  next: SyncStatus | null,
): string | null {
  if (!next || previous === next) return null;
  if (previous === null && next === HEALTHY_STATUS) return null;
  return STATUS_MESSAGES[next] ?? null;
}

function requestKeys(snapshot: InboxSnapshot): Set<string> {
  return new Set(requestedItems(snapshot).map((item) => prRef(item.pr)));
}

function newRequestsMessage(
  previous: InboxSnapshot | null,
  next: InboxSnapshot | null,
): string | null {
  if (!previous?.syncedAt || !next) return null;
  const known = requestKeys(previous);
  const added = [...requestKeys(next)].filter((key) => !known.has(key));
  if (added.length === 0) return null;
  return pluralize(added.length, 'new review request');
}

const FAILURE_WORDS: Partial<Record<PrActionState['kind'], string>> = {
  'merge-failed': 'Merge failed',
  'close-failed': 'Close failed',
};

function failureMessage(
  previous: InboxSnapshot | null,
  next: InboxSnapshot | null,
): string | null {
  if (!next) return null;
  const fresh = Object.entries(next.actions).find(
    ([key, state]) =>
      FAILURE_WORDS[state.kind] && previous?.actions[key]?.kind !== state.kind,
  );
  if (!fresh) return null;
  const [, state] = fresh;
  const reason = 'message' in state ? state.message : '';
  return `${FAILURE_WORDS[state.kind]}: ${reason}`;
}

function nextTracked(
  tracked: Tracked,
  snapshot: InboxSnapshot | null,
): Tracked {
  const settled = settledStatus(tracked.settled, snapshot);
  const parts = [
    statusMessage(tracked.settled, settled),
    newRequestsMessage(tracked.snapshot, snapshot),
    failureMessage(tracked.snapshot, snapshot),
  ].filter(Boolean);
  return {
    snapshot,
    settled,
    message: parts.length > 0 ? parts.join('. ') : tracked.message,
  };
}

interface Announcement {
  text: string;
}

let latestAnnouncement: Announcement = { text: '' };
const announcementListeners = new Set<() => void>();

export function announce(text: string) {
  latestAnnouncement = { text };
  announcementListeners.forEach((listener) => listener());
}

function subscribeToAnnouncements(listener: () => void) {
  announcementListeners.add(listener);
  return () => announcementListeners.delete(listener);
}

function useAnnouncement(): Announcement {
  return useSyncExternalStore(
    subscribeToAnnouncements,
    () => latestAnnouncement,
  );
}

export function LiveAnnouncer({
  snapshot,
}: {
  snapshot: InboxSnapshot | null;
}) {
  const [tracked, setTracked] = useState<Tracked>(() => ({
    snapshot,
    settled: settledStatus(null, snapshot),
    message: '',
  }));
  const announcement = useAnnouncement();
  const [heard, setHeard] = useState(announcement);
  if (tracked.snapshot !== snapshot) setTracked(nextTracked(tracked, snapshot));
  if (heard !== announcement) {
    setHeard(announcement);
    setTracked({ ...tracked, message: announcement.text });
  }
  return (
    <div role="status" aria-live="polite" className="sr-only">
      {tracked.message}
    </div>
  );
}
