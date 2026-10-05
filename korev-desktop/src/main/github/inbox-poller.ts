import type { Inbox, InboxInput } from '../../inbox/build-inbox';
import {
  type UnknownMergeStreaks,
  advanceUnknownMergeStreaks,
} from '../../inbox/merge-streaks';
import {
  groupMyPrs,
  groupReviews,
  myPrsIn,
  reviewItemsIn,
  sortApproved,
} from '../../inbox/stacks';
import type { InboxSnapshot, SyncStatus } from '../../shared/inbox';
import type { MergeTool } from '../../shared/merge';
import type { GithubClient, InboxResult } from './client';
import {
  AuthLostError,
  NetworkError,
  RateLimitedError,
  describeError,
} from './errors';
import {
  type NotificationsResult,
  shouldRefreshFromNotifications,
} from './notifications';
import type { RepoRename } from './repo-access';

export type InboxPollerClient = Pick<
  GithubClient,
  'fetchInbox' | 'checkNotifications' | 'clearSessionCache'
>;

export type TimerHandle = ReturnType<typeof setTimeout>;

export interface Scheduler {
  setTimeout(callback: () => void, delayMs: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

export interface InboxPollerDeps {
  client: InboxPollerClient;
  buildInbox(input: InboxInput): Inbox;
  token(): string | null;
  repos(): string[];
  mergeWith(): Record<string, MergeTool>;
  keptPrs(): Record<string, string>;
  needsAnswer(): string[];
  renameRepos(renames: RepoRename[]): Promise<void>;
  now(): Date;
  scheduler: Scheduler;
  publish(snapshot: InboxSnapshot): void;
}

export type TriggerReason = 'manual' | 'focus';

export interface InboxPoller {
  snapshot(): InboxSnapshot;
  restore(cached: InboxSnapshot): void;
  rebuild(): void;
  start(): Promise<void>;
  trigger(reason: TriggerReason): Promise<void>;
  restart(): Promise<void>;
  reset(): void;
  suspend(): void;
  resume(): Promise<void>;
  stop(): void;
}

type TimerName = 'sync' | 'notifications';

type FreshNotifications = Extract<NotificationsResult, { status: 'ok' }>;

interface SessionState {
  unknownMergeStreaks: UnknownMergeStreaks;
  lastSeenUpdatedAt: string | null;
  ifModifiedSince: string | null;
  pollIntervalSeconds: number;
}

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const FULL_REFRESH_INTERVAL_MS = 3 * MS_PER_MINUTE;
const FOCUS_THROTTLE_MS = 30 * MS_PER_SECOND;
const DEFAULT_POLL_INTERVAL_SECONDS = 60;
const NOTIFICATIONS_SINCE_OVERLAP_MS = 60 * MS_PER_MINUTE;
const OFFLINE_FIRST_RETRY_MS = 30 * MS_PER_SECOND;
const OFFLINE_MAX_RETRY_MS = 5 * MS_PER_MINUTE;
const OFFLINE_BACKOFF_FACTOR = 2;

const TRIGGER_BLOCKING_STATUSES: ReadonlySet<SyncStatus> = new Set([
  'paused',
  'rate_limited',
  'auth_lost',
]);

const NOTIFYING_STATUSES: ReadonlySet<SyncStatus> = new Set([
  'live',
  'error',
  'syncing',
]);

export function emptySnapshot(repoCount = 0): InboxSnapshot {
  return {
    status: 'idle',
    syncedAt: null,
    fromCache: false,
    viewerLogin: null,
    repoCount,
    mine: [],
    reviews: { entries: [], approved: [] },
    reviewCount: 0,
    problems: [],
    repoMerge: {},
    repoAvatars: {},
    actions: {},
    agentTasks: {},
    agentHistory: {},
    truncated: { mine: false, reviews: false },
    stacksUnavailable: false,
    error: null,
    rateLimitResetAt: null,
    nextRetryAt: null,
  };
}

export function createInboxPoller(deps: InboxPollerDeps): InboxPoller {
  return new GithubInboxPoller(deps);
}

function freshSession(): SessionState {
  return {
    unknownMergeStreaks: {},
    lastSeenUpdatedAt: null,
    ifModifiedSince: null,
    pollIntervalSeconds: DEFAULT_POLL_INTERVAL_SECONDS,
  };
}

function offlineRetryDelay(failedAttempts: number): number {
  return Math.min(
    OFFLINE_FIRST_RETRY_MS * OFFLINE_BACKOFF_FACTOR ** failedAttempts,
    OFFLINE_MAX_RETRY_MS,
  );
}

function sinceWithOverlap(lastSeenUpdatedAt: string): string {
  const since = Date.parse(lastSeenUpdatedAt) - NOTIFICATIONS_SINCE_OVERLAP_MS;
  return new Date(since).toISOString();
}

function isSessionFailure(error: unknown): boolean {
  return (
    error instanceof AuthLostError ||
    error instanceof RateLimitedError ||
    error instanceof NetworkError
  );
}

class GithubInboxPoller implements InboxPoller {
  #current = emptySnapshot();
  #session = freshSession();
  #epoch = 0;
  #controller = new AbortController();
  #running: Promise<void> | null = null;
  #followUpQueued = false;
  #stopped = false;
  #offlineAttempts = 0;
  #lastSyncFinishedAt: number | null = null;
  #dataToken: string | null = null;
  #lastFetched: InboxResult | null = null;
  #timers: Partial<Record<TimerName, TimerHandle>> = {};

  constructor(private readonly deps: InboxPollerDeps) {}

  snapshot(): InboxSnapshot {
    return this.#current;
  }

  restore(cached: InboxSnapshot): void {
    this.#dataToken = this.deps.token();
    this.#publish({
      ...cached,
      status: 'idle',
      fromCache: true,
      error: null,
      rateLimitResetAt: null,
      nextRetryAt: null,
    });
  }

  rebuild(): void {
    if (this.#lastFetched) {
      this.#publish({ ...this.#current, ...this.#build(this.#lastFetched) });
      return;
    }
    const repoOrder = this.deps.repos();
    const { mine, reviews } = this.#current;
    this.#publish({
      ...this.#current,
      mine: groupMyPrs(myPrsIn(mine), repoOrder),
      reviews: {
        entries: groupReviews(reviewItemsIn(reviews.entries), repoOrder),
        approved: sortApproved(reviews.approved, repoOrder),
      },
    });
  }

  start(): Promise<void> {
    this.#stopped = false;
    return this.#requestSync();
  }

  trigger(reason: TriggerReason): Promise<void> {
    if (!this.#acceptsTriggers()) return Promise.resolve();
    if (reason === 'focus' && this.#syncedRecently()) return Promise.resolve();
    return this.#requestSync();
  }

  restart(): Promise<void> {
    this.#invalidateInFlight();
    this.#lastFetched = null;
    this.#session = freshSession();
    this.#offlineAttempts = 0;
    return this.#requestSync();
  }

  reset(): void {
    this.#invalidateInFlight();
    this.#lastFetched = null;
    this.#session = freshSession();
    this.#offlineAttempts = 0;
    this.#dataToken = null;
    this.deps.client.clearSessionCache();
    this.#publish(emptySnapshot());
  }

  suspend(): void {
    if (this.#stopped || this.#current.status === 'auth_lost') return;
    this.#invalidateInFlight();
    this.#publish({ ...this.#current, status: 'paused', nextRetryAt: null });
  }

  resume(): Promise<void> {
    if (this.#current.status !== 'paused') return Promise.resolve();
    return this.#requestSync();
  }

  stop(): void {
    this.#stopped = true;
    this.#invalidateInFlight();
  }

  #requestSync(): Promise<void> {
    if (this.#stopped) return Promise.resolve();
    if (this.#running) {
      this.#followUpQueued = true;
      return this.#running;
    }
    this.#running = this.#drainQueue().finally(() => {
      this.#running = null;
    });
    return this.#running;
  }

  async #drainQueue(): Promise<void> {
    do {
      this.#followUpQueued = false;
      await this.#syncOnce();
    } while (this.#followUpQueued);
  }

  async #syncOnce(): Promise<void> {
    const token = this.deps.token();
    const repos = this.deps.repos();
    if (!token || repos.length === 0) return this.#enterIdle(repos.length);
    const epoch = this.#epoch;
    const startedAt = this.deps.now();
    this.#publishSyncing(token, repos.length);
    try {
      const fetched = await this.deps.client.fetchInbox(
        token,
        repos,
        this.#controller.signal,
      );
      if (epoch !== this.#epoch) return;
      this.#enterLive(fetched, token, repos.length, startedAt);
      await this.#followRenames(fetched.renamedRepos, epoch);
    } catch (error) {
      if (epoch !== this.#epoch) return;
      this.#lastSyncFinishedAt = this.deps.now().getTime();
      this.#enterFailure(error);
    }
  }

  async #followRenames(renames: RepoRename[], epoch: number): Promise<void> {
    if (renames.length === 0) return;
    await this.deps.renameRepos(renames);
    if (epoch !== this.#epoch || this.#stillSelected(renames)) return;
    this.#followUpQueued = true;
  }

  #stillSelected(renames: RepoRename[]): boolean {
    const selected = this.deps.repos();
    return renames.some((rename) => selected.includes(rename.from));
  }

  #enterIdle(repoCount: number): void {
    this.#cancelAllTimers();
    this.#dataToken = null;
    this.#publish(emptySnapshot(repoCount));
  }

  #publishSyncing(token: string, repoCount: number): void {
    const base = token === this.#dataToken ? this.#current : emptySnapshot();
    this.#publish({
      ...base,
      status: 'syncing',
      repoCount,
      rateLimitResetAt: null,
      nextRetryAt: null,
    });
  }

  #enterLive(
    fetched: InboxResult,
    token: string,
    repoCount: number,
    startedAt: Date,
  ): void {
    this.#session.unknownMergeStreaks = advanceUnknownMergeStreaks(
      this.#session.unknownMergeStreaks,
      fetched.mine,
    );
    this.#session.lastSeenUpdatedAt ??= startedAt.toISOString();
    this.#offlineAttempts = 0;
    this.#dataToken = token;
    this.#lastFetched = fetched;
    this.#lastSyncFinishedAt = this.deps.now().getTime();
    this.#publish(this.#toSnapshot(fetched, repoCount));
    this.#scheduleLiveTimers();
  }

  #build(fetched: InboxResult) {
    return {
      ...this.deps.buildInbox({
        mine: fetched.mine,
        reviews: fetched.reviews,
        viewer: { login: fetched.viewerLogin, teams: fetched.viewerTeams },
        now: this.deps.now(),
        unknownMergeStreaks: this.#session.unknownMergeStreaks,
        repoOrder: this.deps.repos(),
        mergeWith: this.deps.mergeWith(),
        keptPrs: this.deps.keptPrs(),
        needsAnswer: this.deps.needsAnswer(),
      }),
      repoMerge: fetched.repoMerge,
      repoAvatars: fetched.repoAvatars,
    };
  }

  #toSnapshot(fetched: InboxResult, repoCount: number): InboxSnapshot {
    return {
      ...emptySnapshot(repoCount),
      ...this.#build(fetched),
      status: 'live',
      syncedAt: this.deps.now().toISOString(),
      viewerLogin: fetched.viewerLogin,
      problems: fetched.problems,
      truncated: fetched.truncated,
      stacksUnavailable: fetched.stacksUnavailable,
    };
  }

  #enterFailure(error: unknown): void {
    this.#followUpQueued = false;
    if (error instanceof AuthLostError) return this.#enterAuthLost(error);
    if (error instanceof RateLimitedError) return this.#enterRateLimited(error);
    if (error instanceof NetworkError) return this.#enterOffline(error);
    this.#publish({
      ...this.#current,
      status: 'error',
      error: describeError(error),
    });
    this.#scheduleLiveTimers();
  }

  #enterAuthLost(error: AuthLostError): void {
    this.#cancelAllTimers();
    this.#publish({
      ...this.#current,
      status: 'auth_lost',
      error: error.message,
      rateLimitResetAt: null,
      nextRetryAt: null,
    });
  }

  #enterRateLimited(error: RateLimitedError): void {
    this.#cancelAllTimers();
    const waitMs = error.resetAt.getTime() - this.deps.now().getTime();
    this.#schedule('sync', Math.max(waitMs, 0), () => this.#requestSync());
    this.#publish({
      ...this.#current,
      status: 'rate_limited',
      error: error.message,
      rateLimitResetAt: error.resetAt.toISOString(),
      nextRetryAt: null,
    });
  }

  #enterOffline(error: NetworkError): void {
    this.#cancelAllTimers();
    const delayMs = offlineRetryDelay(this.#offlineAttempts);
    this.#offlineAttempts += 1;
    this.#schedule('sync', delayMs, () => this.#requestSync());
    const retryAt = new Date(this.deps.now().getTime() + delayMs);
    this.#publish({
      ...this.#current,
      status: 'offline',
      error: error.message,
      rateLimitResetAt: null,
      nextRetryAt: retryAt.toISOString(),
    });
  }

  #scheduleLiveTimers(): void {
    this.#schedule('sync', FULL_REFRESH_INTERVAL_MS, () => this.#requestSync());
    this.#scheduleNotificationCheck();
  }

  #scheduleNotificationCheck(): void {
    if (this.#timers.notifications !== undefined) return;
    const delayMs = this.#session.pollIntervalSeconds * MS_PER_SECOND;
    this.#schedule('notifications', delayMs, () => this.#checkNotifications());
  }

  async #checkNotifications(): Promise<void> {
    const token = this.deps.token();
    const lastSeen = this.#session.lastSeenUpdatedAt;
    if (!token || !lastSeen || !this.#acceptsNotifications()) return;
    const epoch = this.#epoch;
    try {
      const result = await this.deps.client.checkNotifications(token, {
        since: sinceWithOverlap(lastSeen),
        ifModifiedSince: this.#session.ifModifiedSince,
        signal: this.#controller.signal,
      });
      if (epoch !== this.#epoch || !this.#acceptsNotifications()) return;
      if (result.status === 'ok') this.#applyNotifications(result, lastSeen);
      this.#scheduleNotificationCheck();
    } catch (error) {
      if (epoch !== this.#epoch || !this.#acceptsNotifications()) return;
      this.#onNotificationsFailure(error);
    }
  }

  #applyNotifications(result: FreshNotifications, lastSeen: string): void {
    this.#session.ifModifiedSince =
      result.lastModified ?? this.#session.ifModifiedSince;
    this.#session.pollIntervalSeconds =
      result.pollIntervalSeconds ?? this.#session.pollIntervalSeconds;
    const decision = shouldRefreshFromNotifications(result.threads, {
      repos: this.deps.repos(),
      lastSeenUpdatedAt: lastSeen,
    });
    if (!decision.refresh) return;
    this.#session.lastSeenUpdatedAt = decision.newestUpdatedAt;
    void this.#requestSync();
  }

  #onNotificationsFailure(error: unknown): void {
    if (isSessionFailure(error)) return this.#enterFailure(error);
    this.#scheduleNotificationCheck();
  }

  #acceptsTriggers(): boolean {
    if (this.#stopped) return false;
    return !TRIGGER_BLOCKING_STATUSES.has(this.#current.status);
  }

  #acceptsNotifications(): boolean {
    return NOTIFYING_STATUSES.has(this.#current.status);
  }

  #syncedRecently(): boolean {
    if (this.#lastSyncFinishedAt === null) return false;
    const elapsed = this.deps.now().getTime() - this.#lastSyncFinishedAt;
    return elapsed < FOCUS_THROTTLE_MS;
  }

  #invalidateInFlight(): void {
    this.#epoch += 1;
    this.#controller.abort();
    this.#controller = new AbortController();
    this.#followUpQueued = false;
    this.#cancelAllTimers();
  }

  #schedule(name: TimerName, delayMs: number, run: () => unknown): void {
    this.#cancel(name);
    this.#timers[name] = this.deps.scheduler.setTimeout(() => {
      delete this.#timers[name];
      void run();
    }, delayMs);
  }

  #cancel(name: TimerName): void {
    const handle = this.#timers[name];
    if (handle === undefined) return;
    this.deps.scheduler.clearTimeout(handle);
    delete this.#timers[name];
  }

  #cancelAllTimers(): void {
    this.#cancel('sync');
    this.#cancel('notifications');
  }

  #publish(next: InboxSnapshot): void {
    this.#current = next;
    this.deps.publish(next);
  }
}
