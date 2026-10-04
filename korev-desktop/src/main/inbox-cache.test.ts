import { describe, expect, it } from 'vitest';
import type { InboxSnapshot } from '../shared/inbox';
import type { SecretCipher } from './encrypted-file';
import { createMemoryFileSystem } from './file-system';
import { emptySnapshot } from './github/inbox-poller';
import { CACHE_VERSION, createInboxCache } from './inbox-cache';

const PATH = '/user-data/inbox-cache.bin';
const PREFIX = 'enc:';

const cipher: SecretCipher = {
  isAvailable: async () => true,
  storageBackend: () => 'keychain',
  encrypt: async (plainText) => Buffer.from(PREFIX + plainText),
  decrypt: async (encrypted) => ({
    result: encrypted.toString().slice(PREFIX.length),
    shouldReEncrypt: false,
  }),
};

const refusingCipher: SecretCipher = {
  ...cipher,
  decrypt: async () => {
    throw new Error('Keychain refused');
  },
};

function liveSnapshot(viewerLogin: string): InboxSnapshot {
  return {
    ...emptySnapshot(2),
    status: 'live',
    syncedAt: '2026-10-03T14:02:00.000Z',
    viewerLogin,
    reviewCount: 3,
  };
}

function setup(withCipher = cipher) {
  const fs = createMemoryFileSystem();
  return {
    fs,
    cache: createInboxCache({ cipher: withCipher, fs, path: PATH }),
  };
}

describe('inbox cache', () => {
  it('returns the saved snapshot encrypted at rest', async () => {
    const { fs, cache } = setup();
    await cache.save(liveSnapshot('maria'));

    expect(await cache.load('maria')).toEqual(liveSnapshot('maria'));
    expect(fs.files.get(PATH)?.toString().startsWith(PREFIX)).toBe(true);
  });

  it('starts empty when the cache cannot be decrypted', async () => {
    const { fs, cache } = setup();
    await cache.save(liveSnapshot('maria'));
    const locked = createInboxCache({ cipher: refusingCipher, fs, path: PATH });

    expect(await locked.load('maria')).toBeNull();
  });

  it("ignores another account's cache", async () => {
    const { cache } = setup();
    await cache.save(liveSnapshot('maria'));

    expect(await cache.load('octocat')).toBeNull();
  });

  it('ignores a cache saved with an older version', async () => {
    const { fs, cache } = setup();
    const older = {
      version: CACHE_VERSION - 1,
      snapshot: liveSnapshot('maria'),
    };
    fs.files.set(PATH, Buffer.from(PREFIX + JSON.stringify(older)));

    expect(await cache.load('maria')).toBeNull();
  });

  it('forgets the snapshot when cleared', async () => {
    const { cache } = setup();
    await cache.save(liveSnapshot('maria'));
    await cache.clear();

    expect(await cache.load('maria')).toBeNull();
  });
});
