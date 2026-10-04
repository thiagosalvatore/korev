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
} from './github/test-fetch';
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

function inboxResponse(...names: string[]): CannedResponse {
  const access = names.map((nameWithOwner, index) => [
    `repo${index}`,
    { nameWithOwner, viewerPermission: 'WRITE', isArchived: false },
  ]);
  return {
    body: {
      data: {
        viewer: VIEWER,
        ...Object.fromEntries(access),
        mine: EMPTY_SEARCH,
        reviews: EMPTY_SEARCH,
      },
    },
  };
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
    fs,
    cipher: plainCipher,
    fetch: fake.fetch,
    github: githubEndpoints(true, {}),
    sleep: async () => undefined,
    openExternal: async () => undefined,
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
      inboxResponse('acme/web', 'acme/api-v2'),
      teamsResponse,
      inboxResponse('acme/web', 'acme/api-v2'),
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
      inboxResponse('acme/api', 'acme/web'),
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
});
