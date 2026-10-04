import type { InboxSnapshot } from '../shared/inbox';
import {
  createEncryptedFile,
  hasSecureStorage,
  type SecretCipher,
} from './encrypted-file';
import type { FileSystem } from './file-system';

export interface InboxCache {
  load(login: string): Promise<InboxSnapshot | null>;
  save(snapshot: InboxSnapshot): Promise<void>;
  clear(): Promise<void>;
}

interface CacheFile {
  version: number;
  snapshot: InboxSnapshot;
}

export const CACHE_VERSION = 4;

function sameLogin(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function parseSnapshot(text: string): InboxSnapshot | null {
  try {
    const parsed = JSON.parse(text) as Partial<CacheFile>;
    if (parsed.version !== CACHE_VERSION) return null;
    const snapshot = parsed.snapshot;
    if (!snapshot?.syncedAt || typeof snapshot.viewerLogin !== 'string') {
      return null;
    }
    return snapshot;
  } catch {
    return null;
  }
}

export function createInboxCache(deps: {
  cipher: SecretCipher;
  fs: FileSystem;
  path: string;
}): InboxCache {
  const file = createEncryptedFile(deps);
  let lastWrite: Promise<void> = Promise.resolve();

  function afterLastWrite(write: () => Promise<void>): Promise<void> {
    lastWrite = lastWrite.catch(() => undefined).then(write);
    return lastWrite;
  }

  async function load(login: string): Promise<InboxSnapshot | null> {
    const read = await file.read();
    if (read.status !== 'read') return null;
    const snapshot = parseSnapshot(read.text);
    if (!snapshot?.viewerLogin || !sameLogin(snapshot.viewerLogin, login)) {
      return null;
    }
    return snapshot;
  }

  async function write(snapshot: InboxSnapshot): Promise<void> {
    if (!(await hasSecureStorage(deps.cipher))) return;
    const contents: CacheFile = { version: CACHE_VERSION, snapshot };
    await file.write(JSON.stringify(contents));
  }

  return {
    load,
    save: (snapshot) => afterLastWrite(() => write(snapshot)),
    clear: () => afterLastWrite(() => file.remove()),
  };
}
