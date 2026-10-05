import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Inbox, InboxInput } from '../../inbox/build-inbox';
import { makePr } from '../../inbox/test-fixtures';
import type { InboxSnapshot } from '../../shared/inbox';
import type { PullRequest } from '../../shared/pull-request';
import type { InboxResult } from './client';
import { AuthLostError, NetworkError, RateLimitedError } from './errors';
import {
  type InboxPollerClient,
  createInboxPoller,
  emptySnapshot,
} from './inbox-poller';

const START = new Date('2026-10-03T12:00:00Z');
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const LAST_MODIFIED = 'Sat, 03 Oct 2026 12:00:30 GMT';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((onResolve) => {
    resolve = onResolve;
  });
  return { promise, resolve };
}

function inboxResult(
  mine: PullRequest[] = [],
  viewerLogin = 'maria',
): InboxResult {
  return {
    viewerLogin,
    viewerTeams: [],
    mine,
    reviews: [],
    truncated: { mine: false, reviews: false },
    problems: [],
    renamedRepos: [],
    repoMerge: {},
    repoAvatars: {},
    stacksUnavailable: false,
  };
}

function fakeBuildInbox(input: InboxInput): Inbox {
  const rank = (pr: PullRequest) => {
    const index = input.repoOrder.indexOf(pr.repo);
    return index === -1 ? input.repoOrder.length : index;
  };
  const prs = [...input.mine].sort((left, right) => rank(left) - rank(right));
  return {
    mine: [
      {
        bucket: 'needs-you',
        count: prs.length,
        entries: prs.map((pr) => ({
          kind: 'pr',
          item: { pr, bucket: 'needs-you', reasons: [], queue: null },
        })),
      },
    ],
    reviews: { entries: [], approved: [] },
    reviewCount: 0,
  };
}

function prIds(snapshot: InboxSnapshot | undefined): string[] {
  return (snapshot?.mine ?? [])
    .flatMap((section) => section.entries)
    .flatMap((entry) => (entry.kind === 'pr' ? [entry.item.pr.id] : []));
}

function advance(milliseconds: number) {
  return vi.advanceTimersByTimeAsync(milliseconds);
}

function setup() {
  const published: InboxSnapshot[] = [];
  const builds: InboxInput[] = [];
  const session = {
    token: 'gho_maria' as string | null,
    repos: ['acme/api'],
  };
  const client = {
    fetchInbox: vi
      .fn<InboxPollerClient['fetchInbox']>()
      .mockResolvedValue(inboxResult()),
    checkNotifications: vi
      .fn<InboxPollerClient['checkNotifications']>()
      .mockResolvedValue({ status: 'not_modified' }),
    clearSessionCache: vi.fn(),
  };
  const poller = createInboxPoller({
    client,
    buildInbox: (input) => {
      builds.push(input);
      return fakeBuildInbox(input);
    },
    token: () => session.token,
    repos: () => session.repos,
    mergeWith: () => ({}),
    keptPrs: () => ({}),
    needsAnswer: () => [],
    renameRepos: async (renames) => {
      session.repos = session.repos.map(
        (repo) => renames.find((rename) => rename.from === repo)?.to ?? repo,
      );
    },
    now: () => new Date(),
    scheduler: {
      setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
      clearTimeout: (handle) => clearTimeout(handle),
    },
    publish: (snapshot) => published.push(snapshot),
  });
  return {
    poller,
    client,
    session,
    published,
    builds,
    last: () => published.at(-1),
    syncCount: () => client.fetchInbox.mock.calls.length,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ now: START });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('inbox poller', () => {
  it('stays idle and schedules nothing without repos', async () => {
    const { poller, session, last, syncCount } = setup();
    session.repos = [];

    await poller.start();

    expect(syncCount()).toBe(0);
    expect(last()?.status).toBe('idle');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('publishes syncing, then a live snapshot', async () => {
    const { poller, client, last } = setup();
    const pending = deferred<InboxResult>();
    client.fetchInbox.mockReturnValueOnce(pending.promise);

    const starting = poller.start();
    expect(last()?.status).toBe('syncing');
    pending.resolve(inboxResult([makePr({ id: 'PR_1' })]));
    await starting;

    expect(last()).toMatchObject({
      status: 'live',
      syncedAt: START.toISOString(),
      repoCount: 1,
    });
    expect(prIds(last())).toEqual(['PR_1']);
  });

  it('shows a restored snapshot while the first sync runs, then replaces it', async () => {
    const { poller, client, last } = setup();
    const pending = deferred<InboxResult>();
    client.fetchInbox.mockReturnValueOnce(pending.promise);
    const cached = fakeBuildInbox({
      mine: [makePr({ id: 'PR_CACHED' })],
      repoOrder: [],
    } as unknown as InboxInput);

    poller.restore({
      ...emptySnapshot(1),
      ...cached,
      status: 'live',
      syncedAt: '2026-10-02T18:40:00.000Z',
      viewerLogin: 'maria',
    });
    const starting = poller.start();
    expect(last()).toMatchObject({ status: 'syncing', fromCache: true });
    expect(prIds(last())).toEqual(['PR_CACHED']);
    pending.resolve(inboxResult([makePr({ id: 'PR_1' })]));
    await starting;

    expect(last()).toMatchObject({ status: 'live', fromCache: false });
    expect(prIds(last())).toEqual(['PR_1']);
  });

  it('rebuilds in the new repo order without fetching', async () => {
    const { poller, client, session, last, syncCount } = setup();
    session.repos = ['acme/api', 'acme/web'];
    client.fetchInbox.mockResolvedValueOnce(
      inboxResult([
        makePr({ id: 'PR_API', repo: 'acme/api' }),
        makePr({ id: 'PR_WEB', repo: 'acme/web' }),
      ]),
    );
    await poller.start();

    session.repos = ['acme/web', 'acme/api'];
    poller.rebuild();

    expect(prIds(last())).toEqual(['PR_WEB', 'PR_API']);
    expect(syncCount()).toBe(1);
  });

  it('re-sorts entries inside a section of a cached snapshot without fetching', () => {
    const { poller, session, last, syncCount } = setup();
    const cached = fakeBuildInbox({
      mine: [
        makePr({ id: 'PR_API', repo: 'acme/api' }),
        makePr({ id: 'PR_WEB', repo: 'acme/web' }),
      ],
      repoOrder: ['acme/api', 'acme/web'],
    } as unknown as InboxInput);
    poller.restore({
      ...emptySnapshot(2),
      ...cached,
      syncedAt: '2026-10-02T18:40:00.000Z',
      viewerLogin: 'maria',
    });

    session.repos = ['acme/web', 'acme/api'];
    poller.rebuild();

    expect(prIds(last())).toEqual(['PR_WEB', 'PR_API']);
    expect(syncCount()).toBe(0);
  });

  it('runs a full refresh every three minutes while live', async () => {
    const { poller, syncCount } = setup();
    await poller.start();

    await advance(3 * MINUTE - 1);
    expect(syncCount()).toBe(1);
    await advance(1);

    expect(syncCount()).toBe(2);
  });

  it('does not sync when notifications are not modified', async () => {
    const { poller, client, syncCount } = setup();
    await poller.start();

    await advance(MINUTE);

    expect(client.checkNotifications).toHaveBeenCalledOnce();
    expect(client.checkNotifications.mock.calls[0][1]).toMatchObject({
      ifModifiedSince: null,
    });
    expect(syncCount()).toBe(1);
  });

  it('syncs on a newer notification for a selected repo and polls at the interval GitHub asks for', async () => {
    const { poller, client, syncCount } = setup();
    client.checkNotifications.mockResolvedValueOnce({
      status: 'ok',
      threads: [
        {
          repo: 'acme/api',
          type: 'PullRequest',
          updatedAt: '2026-10-03T12:00:30Z',
        },
      ],
      lastModified: LAST_MODIFIED,
      pollIntervalSeconds: 120,
    });
    await poller.start();

    await advance(MINUTE);
    expect(syncCount()).toBe(2);
    await advance(2 * MINUTE - 1);
    expect(client.checkNotifications).toHaveBeenCalledOnce();
    await advance(1);

    expect(client.checkNotifications).toHaveBeenCalledTimes(2);
    expect(client.checkNotifications.mock.calls[1][1]).toMatchObject({
      ifModifiedSince: LAST_MODIFIED,
    });
    expect(syncCount()).toBe(2);
  });

  it('goes offline on a network error, keeps the data, backs off to five minutes and recovers', async () => {
    const { poller, client, last } = setup();
    client.fetchInbox.mockResolvedValueOnce(
      inboxResult([makePr({ id: 'PR_1' })]),
    );
    await poller.start();
    client.fetchInbox.mockRejectedValue(new NetworkError('fetch failed'));
    const retryIn = () => Date.parse(last()?.nextRetryAt ?? '') - Date.now();

    await advance(3 * MINUTE);
    expect(last()?.status).toBe('offline');
    expect(prIds(last())).toEqual(['PR_1']);
    for (const delaySeconds of [30, 60, 120, 240, 300]) {
      expect(retryIn()).toBe(delaySeconds * SECOND);
      await advance(delaySeconds * SECOND);
    }
    expect(retryIn()).toBe(5 * MINUTE);
    client.fetchInbox.mockResolvedValue(inboxResult());
    await advance(5 * MINUTE);

    expect(last()).toMatchObject({ status: 'live', nextRetryAt: null });
  });

  it('waits out a rate limit, ignores triggers meanwhile, then resumes', async () => {
    const { poller, client, last, syncCount } = setup();
    const resetAt = new Date(START.getTime() + 10 * MINUTE);
    client.fetchInbox.mockRejectedValueOnce(
      new RateLimitedError('API rate limit exceeded', resetAt),
    );

    await poller.start();
    expect(last()).toMatchObject({
      status: 'rate_limited',
      rateLimitResetAt: resetAt.toISOString(),
    });
    await poller.trigger('manual');
    await advance(10 * MINUTE - 1);
    expect(syncCount()).toBe(1);
    await advance(1);

    expect(syncCount()).toBe(2);
    expect(last()?.status).toBe('live');
  });

  it('stops every timer when the token is rejected', async () => {
    const { poller, client, last, syncCount } = setup();
    await poller.start();
    client.fetchInbox.mockRejectedValueOnce(new AuthLostError('Bad creds'));

    await advance(3 * MINUTE);
    expect(last()?.status).toBe('auth_lost');
    expect(vi.getTimerCount()).toBe(0);
    await poller.trigger('manual');
    await advance(10 * MINUTE);

    expect(syncCount()).toBe(2);
  });

  it('pauses on suspend and syncs right away on resume', async () => {
    const { poller, last, syncCount } = setup();
    await poller.start();

    poller.suspend();
    expect(last()?.status).toBe('paused');
    await advance(10 * MINUTE);
    expect(syncCount()).toBe(1);
    await poller.resume();

    expect(syncCount()).toBe(2);
    expect(last()?.status).toBe('live');
  });

  it('ignores focus until thirty seconds after the last sync', async () => {
    const { poller, syncCount } = setup();
    await poller.start();

    await poller.trigger('focus');
    expect(syncCount()).toBe(1);
    await advance(30 * SECOND);
    await poller.trigger('focus');

    expect(syncCount()).toBe(2);
  });

  it('queues exactly one follow-up for triggers during a sync', async () => {
    const { poller, client, syncCount } = setup();
    const pending = deferred<InboxResult>();
    client.fetchInbox.mockReturnValueOnce(pending.promise);

    const starting = poller.start();
    void poller.trigger('manual');
    void poller.trigger('manual');
    pending.resolve(inboxResult());
    await starting;

    expect(syncCount()).toBe(2);
  });

  it('publishes nothing stale after a disconnect mid-sync and ends idle', async () => {
    const { poller, client, published, last } = setup();
    const pending = deferred<InboxResult>();
    client.fetchInbox.mockReturnValueOnce(pending.promise);

    const starting = poller.start();
    poller.reset();
    pending.resolve(inboxResult([makePr({ id: 'PR_1' })]));
    await starting;

    expect(published.some((snapshot) => snapshot.status === 'live')).toBe(
      false,
    );
    expect(last()?.status).toBe('idle');
    expect(client.clearSessionCache).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('publishes only the new repo set after a repo change mid-sync', async () => {
    const { poller, client, session, published } = setup();
    const oldSync = deferred<InboxResult>();
    const newSync = deferred<InboxResult>();
    client.fetchInbox
      .mockReturnValueOnce(oldSync.promise)
      .mockReturnValueOnce(newSync.promise);

    const starting = poller.start();
    session.repos = ['acme/web', 'acme/api'];
    void poller.restart();
    oldSync.resolve(inboxResult([makePr({ id: 'PR_OLD' })]));
    await advance(0);
    newSync.resolve(inboxResult([makePr({ id: 'PR_NEW' })]));
    await starting;

    const live = published.filter((snapshot) => snapshot.status === 'live');
    expect(live).toHaveLength(1);
    expect(live[0].repoCount).toBe(2);
    expect(prIds(live[0])).toEqual(['PR_NEW']);
  });

  it('shows none of the previous account PRs after switching accounts', async () => {
    const { poller, client, session, published, last } = setup();
    client.fetchInbox.mockResolvedValueOnce(
      inboxResult([makePr({ id: 'PR_MARIA' })]),
    );
    await poller.start();
    const switchedAt = published.length;

    session.token = 'gho_joao';
    client.fetchInbox.mockResolvedValueOnce(
      inboxResult([makePr({ id: 'PR_JOAO' })], 'joao'),
    );
    await poller.restart();

    const afterSwitch = published.slice(switchedAt).flatMap(prIds);
    expect(afterSwitch).not.toContain('PR_MARIA');
    expect(last()?.viewerLogin).toBe('joao');
  });

  it('counts syncs with unknown mergeability and starts over on restart', async () => {
    const { poller, client, builds } = setup();
    const unknown = makePr({ id: 'PR_9', mergeStateStatus: 'UNKNOWN' });
    client.fetchInbox.mockResolvedValue(inboxResult([unknown]));

    await poller.start();
    await advance(3 * MINUTE);
    await advance(3 * MINUTE);
    await poller.restart();

    expect(builds.map((input) => input.unknownMergeStreaks.PR_9)).toEqual([
      1, 2, 3, 1,
    ]);
  });

  it('saves a renamed repo and syncs again with the new name', async () => {
    const { poller, client, session, syncCount } = setup();
    client.fetchInbox.mockResolvedValueOnce({
      ...inboxResult(),
      renamedRepos: [{ from: 'acme/api', to: 'acme/api-v2' }],
    });

    await poller.start();

    expect(session.repos).toEqual(['acme/api-v2']);
    expect(syncCount()).toBe(2);
    expect(client.fetchInbox.mock.calls[1][1]).toEqual(['acme/api-v2']);
  });
});
