import { afterEach, describe, expect, it, vi } from 'vitest';
import { IpcChannel } from '../shared/ipc-contract';
import { createMemoryFileSystem } from './file-system';
import { githubEndpoints } from './github/config';
import { emptySnapshot } from './github/inbox-poller';
import { CACHE_VERSION } from './inbox-cache';
import {
  type CannedReply,
  type CannedResponse,
  createFakeFetch,
  graphqlBody,
} from './github/test-fetch';
import inboxPage from './github/fixtures/inbox-page.json';
import { createKorev, type Korev } from './korev';
import type { SecretCipher } from './encrypted-file';

const VIEWER = { login: 'maria', avatarUrl: 'https://example.test/maria.png' };
const EMPTY_SEARCH = {
  pageInfo: { hasNextPage: false, endCursor: null },
  nodes: [],
};

const plainCipher: SecretCipher = {
  isAvailable: async () => true,
  storageBackend: () => 'keychain',
  encrypt: async (plainText) => Buffer.from(plainText),
  decrypt: async (encrypted) => ({
    result: encrypted.toString(),
    shouldReEncrypt: false,
  }),
};

const viewerResponse: CannedResponse = {
  headers: { 'X-OAuth-Scopes': 'repo, read:org' },
  body: { data: { viewer: VIEWER } },
};

const teamsResponse: CannedResponse = {
  body: { data: { viewer: { organizations: { nodes: [] } } } },
};

const [OPEN_PR_NODE] = inboxPage.data.mine.nodes;
const OPEN_PR_REF = 'acme/api#412';

function inboxReplies(...names: string[]): CannedResponse[] {
  return inboxRepliesWith(EMPTY_SEARCH, names);
}

const OPEN_PR_HEAD = 'f00dcafe';
const OPEN_PR_TARGET = { id: 'PR_412', repo: 'acme/api', number: 412 };

function inboxWithOpenPr(): CannedResponse[] {
  return inboxRepliesWith(
    { ...EMPTY_SEARCH, nodes: [{ ...OPEN_PR_NODE, headRefOid: OPEN_PR_HEAD }] },
    ['acme/api'],
  );
}

function storedExplanation(headOid: string): Record<string, string> {
  return {
    [`${USER_DATA}/explanations.bin`]: JSON.stringify({
      version: 1,
      login: VIEWER.login,
      entries: {
        [OPEN_PR_REF]: {
          headOid,
          format: 'markdown',
          document: '# Why',
          createdAt: '2026-10-04T10:00:00.000Z',
        },
      },
    }),
  };
}

function inboxRepliesWith(
  mine: { nodes: unknown[] },
  names: string[],
): CannedResponse[] {
  const access = names.map((nameWithOwner, index) => [
    `repo${index}`,
    { nameWithOwner, viewerPermission: 'WRITE', isArchived: false },
  ]);
  const bothSearches: CannedResponse = {
    body: {
      data: {
        viewer: VIEWER,
        ...Object.fromEntries(access),
        mine,
        reviews: EMPTY_SEARCH,
      },
    },
  };
  return [bothSearches, bothSearches];
}

const USER_DATA = '/user-data';
const CACHED_PR_TITLE = 'Cached from the last session';

const neverAnswers: CannedReply = () => new Promise(() => undefined);

function previousSession(): Record<string, string> {
  const snapshot = {
    ...emptySnapshot(1),
    status: 'live',
    syncedAt: '2026-10-02T18:40:00.000Z',
    viewerLogin: VIEWER.login,
    reviews: {
      entries: [{ kind: 'pr', item: { pr: { title: CACHED_PR_TITLE } } }],
      approved: [],
    },
  };
  return {
    [`${USER_DATA}/settings.json`]: JSON.stringify({ repos: ['acme/api'] }),
    [`${USER_DATA}/github-token.bin`]: JSON.stringify({
      token: 'gho_saved',
      method: 'oauth',
      login: VIEWER.login,
      avatarUrl: null,
    }),
    [`${USER_DATA}/inbox-cache.bin`]: JSON.stringify({
      version: CACHE_VERSION,
      snapshot,
    }),
  };
}

let running: Korev | null = null;

function setup(
  replies: CannedReply[] = [],
  files: Record<string, string> = {},
) {
  const fake = createFakeFetch(...replies);
  const broadcast = vi.fn();
  const fs = createMemoryFileSystem(files);
  const korev = createKorev({
    userDataPath: USER_DATA,
    tempPath: '/tmp',
    env: {},
    runCommand: async () => {
      throw new Error('No CLI in tests');
    },
    spawnPty: () => {
      throw new Error('No terminal in tests');
    },
    fs,
    cipher: plainCipher,
    fetch: fake.fetch,
    github: githubEndpoints(true, {}),
    sleep: async () => undefined,
    openExternal: async () => undefined,
    openPath: async () => undefined,
    notify: () => undefined,
    prefersDark: () => false,
    applyTheme: () => undefined,
    broadcast,
    warn: () => undefined,
  });
  const invoke = (channel: IpcChannel, ...args: unknown[]) =>
    (korev.handlers[channel] as (...values: unknown[]) => unknown)(...args);
  const settingsBroadcasts = () =>
    broadcast.mock.calls
      .filter(([channel]) => channel === IpcChannel.SettingsChanged)
      .map(([, settings]) => settings);
  running = korev;
  return { korev, fs, fake, invoke, settingsBroadcasts };
}

afterEach(() => {
  running?.inbox.stop();
  running = null;
});

describe('korev', () => {
  it('broadcasts the settings after a setter changes them', async () => {
    const { korev, invoke, settingsBroadcasts } = setup();
    await korev.start();

    await invoke(IpcChannel.SettingsSetTheme, 'dark');

    expect(settingsBroadcasts()).toEqual([
      expect.objectContaining({ theme: 'dark' }),
    ]);
  });

  it('saves the new name of a renamed repo in the same position', async () => {
    const { korev, invoke, settingsBroadcasts } = setup([
      viewerResponse,
      ...inboxReplies('acme/web', 'acme/api-v2'),
      teamsResponse,
      ...inboxReplies('acme/web', 'acme/api-v2'),
    ]);
    await korev.start();
    await invoke(IpcChannel.AuthUseToken, 'ghp_token');

    await invoke(IpcChannel.SettingsSetRepos, ['acme/web', 'acme/api']);

    await vi.waitFor(() =>
      expect(korev.settings.current().repos).toEqual([
        'acme/web',
        'acme/api-v2',
      ]),
    );
    expect(settingsBroadcasts().map((settings) => settings.repos)).toEqual([
      ['acme/web', 'acme/api'],
      ['acme/web', 'acme/api-v2'],
    ]);
  });

  it('reorders repos without asking GitHub again', async () => {
    const { korev, fake, invoke } = setup([
      viewerResponse,
      ...inboxReplies('acme/api', 'acme/web'),
      teamsResponse,
    ]);
    await korev.start();
    await invoke(IpcChannel.AuthUseToken, 'ghp_token');
    await invoke(IpcChannel.SettingsSetRepos, ['acme/api', 'acme/web']);
    await vi.waitFor(() =>
      expect(korev.handlers[IpcChannel.InboxLoad]?.()).toMatchObject({
        status: 'live',
      }),
    );
    const requestsBefore = fake.requests.length;

    await invoke(IpcChannel.SettingsSetRepos, ['acme/web', 'acme/api']);

    expect(fake.requests).toHaveLength(requestsBefore);
    expect(korev.settings.current().repos).toEqual(['acme/web', 'acme/api']);
  });

  it('keeps a PR without asking GitHub again', async () => {
    const { korev, fake, invoke } = setup([
      viewerResponse,
      ...inboxWithOpenPr(),
      teamsResponse,
    ]);
    await korev.start();
    await invoke(IpcChannel.AuthUseToken, 'ghp_token');
    await invoke(IpcChannel.SettingsSetRepos, ['acme/api']);
    await vi.waitFor(() =>
      expect(korev.handlers[IpcChannel.InboxLoad]?.()).toMatchObject({
        status: 'live',
      }),
    );
    const requestsBefore = fake.requests.length;

    await invoke(IpcChannel.SettingsSetKept, [OPEN_PR_REF], true);

    expect(Object.keys(korev.settings.current().keptPrs)).toEqual([
      OPEN_PR_REF,
    ]);
    expect(fake.requests).toHaveLength(requestsBefore);
  });

  it('prunes keeps for PRs that are no longer open after a sync', async () => {
    const keptAt = new Date().toISOString();
    const { korev, invoke } = setup(
      [viewerResponse, ...inboxWithOpenPr(), teamsResponse],
      {
        [`${USER_DATA}/settings.json`]: JSON.stringify({
          repos: ['acme/api'],
          keptPrs: { [OPEN_PR_REF]: keptAt, 'acme/api#999': keptAt },
        }),
      },
    );
    await korev.start();
    await invoke(IpcChannel.AuthUseToken, 'ghp_token');

    await vi.waitFor(() =>
      expect(korev.settings.current().keptPrs).toEqual({
        [OPEN_PR_REF]: keptAt,
      }),
    );
  });

  it('shows the cached inbox from the last session while the first sync runs', async () => {
    const { korev, invoke } = setup([neverAnswers], previousSession());

    await korev.start();

    expect(await invoke(IpcChannel.AuthGetState)).toMatchObject({
      connection: { login: VIEWER.login },
    });
    expect(await invoke(IpcChannel.InboxLoad)).toMatchObject({
      status: 'syncing',
      fromCache: true,
      reviews: { entries: [{ item: { pr: { title: CACHED_PR_TITLE } } }] },
    });
  });

  it('deletes the cached inbox on disconnect', async () => {
    const { korev, fs, invoke } = setup([neverAnswers], previousSession());
    await korev.start();

    await invoke(IpcChannel.AuthDisconnect);

    expect(fs.files.has(`${USER_DATA}/inbox-cache.bin`)).toBe(false);
  });

  it('does not open a terminal for a pull request Korev has no checkout of', async () => {
    const { invoke } = setup();

    expect(
      await invoke(IpcChannel.TerminalOpen, OPEN_PR_TARGET, {
        cols: 80,
        rows: 24,
      }),
    ).toEqual({ ok: false, message: expect.stringContaining('no longer') });
  });

  it('opens the saved explanation for the same head commit without running the agent', async () => {
    const { korev, invoke } = setup([...inboxWithOpenPr(), teamsResponse], {
      ...previousSession(),
      ...storedExplanation(OPEN_PR_HEAD),
    });
    await korev.start();
    await vi.waitFor(() =>
      expect(korev.handlers[IpcChannel.InboxLoad]?.()).toMatchObject({
        status: 'live',
        fromCache: false,
      }),
    );

    expect(await invoke(IpcChannel.AiExplain, OPEN_PR_TARGET, false)).toEqual({
      ok: true,
    });
    expect(await invoke(IpcChannel.InboxLoad)).toMatchObject({
      agentTasks: {},
    });
    expect(await invoke(IpcChannel.AiExplanation, OPEN_PR_TARGET)).toEqual({
      headOid: OPEN_PR_HEAD,
      body: '<h1>Why</h1>\n',
      stale: false,
    });
  });

  it('marks an explanation made for an older head commit as stale', async () => {
    const { korev, invoke } = setup([...inboxWithOpenPr(), teamsResponse], {
      ...previousSession(),
      ...storedExplanation('0ldhead'),
    });
    await korev.start();
    await vi.waitFor(() =>
      expect(korev.handlers[IpcChannel.InboxLoad]?.()).toMatchObject({
        fromCache: false,
      }),
    );

    expect(
      await invoke(IpcChannel.AiExplanation, OPEN_PR_TARGET),
    ).toMatchObject({ stale: true });
  });

  it('finishes Fix CI with nothing to do and fetches the inbox again when no check is failing', async () => {
    const noChecks: CannedResponse = {
      body: {
        data: { repository: { pullRequest: { statusCheckRollup: null } } },
      },
    };
    const { korev, fake, invoke } = setup(
      [...inboxWithOpenPr(), teamsResponse, noChecks, ...inboxWithOpenPr()],
      previousSession(),
    );
    await korev.start();
    await vi.waitFor(() =>
      expect(korev.handlers[IpcChannel.InboxLoad]?.()).toMatchObject({
        status: 'live',
        fromCache: false,
      }),
    );
    const requestsBefore = fake.requests.length;

    await invoke(IpcChannel.AiStart, OPEN_PR_TARGET, 'fix-ci');

    await vi.waitFor(() =>
      expect(korev.handlers[IpcChannel.InboxLoad]?.()).toMatchObject({
        agentTasks: {
          [OPEN_PR_REF]: { status: 'done', nothingToDo: true },
        },
      }),
    );
    await vi.waitFor(() =>
      expect(fake.requests.length).toBeGreaterThan(requestsBefore + 1),
    );
    expect(graphqlBody(fake.requests[requestsBefore]).query).toContain(
      'FailingChecks',
    );
    expect(graphqlBody(fake.requests[requestsBefore + 1]).query).toContain(
      'mine',
    );
  });

  it("deletes saved explanations and Korev's task records on disconnect", async () => {
    const { korev, fs, invoke } = setup([neverAnswers], {
      ...previousSession(),
      ...storedExplanation(OPEN_PR_HEAD),
      [`${USER_DATA}/agent-tasks.bin`]: JSON.stringify({
        version: 1,
        login: VIEWER.login,
        records: {},
      }),
    });
    await korev.start();

    await invoke(IpcChannel.AuthDisconnect);

    expect(fs.files.has(`${USER_DATA}/explanations.bin`)).toBe(false);
    expect(fs.files.has(`${USER_DATA}/agent-tasks.bin`)).toBe(false);
  });
});
