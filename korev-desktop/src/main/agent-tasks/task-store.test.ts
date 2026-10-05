import { describe, expect, it } from 'vitest';
import type { SecretCipher } from '../encrypted-file';
import { createMemoryFileSystem } from '../file-system';
import { TASK_STORE_VERSION, createTaskStore } from './task-store';

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
const STORE_PATH = '/user-data/agent-tasks.bin';
const LOGIN = 'maria';

function runOf(kind: string) {
  return {
    kind,
    outcome: 'done',
    summary: kind,
    commits: [],
    finishedAt: '2026-10-04T10:00:00Z',
  };
}

function recordOf(kind: string, history: object[] = []) {
  return {
    kind,
    state: { status: 'failed', kind, message: 'Stopped' },
    answered: [],
    history,
  };
}

describe('task store', () => {
  it('drops saved tasks and runs of a kind Korev no longer has', async () => {
    const saved = {
      version: TASK_STORE_VERSION,
      login: LOGIN,
      records: {
        'acme/web#1': recordOf('review-fix'),
        'acme/web#2': recordOf('review', [
          runOf('review-fix'),
          runOf('review'),
        ]),
      },
      autopilot: {},
    };
    const fs = createMemoryFileSystem({
      [STORE_PATH]: PREFIX + JSON.stringify(saved),
    });

    const { records } = await createTaskStore({
      cipher,
      fs,
      path: STORE_PATH,
    }).load(LOGIN);

    expect(Object.keys(records)).toEqual(['acme/web#2']);
    expect(records['acme/web#2'].history?.map((run) => run.kind)).toEqual([
      'review',
    ]);
  });
});
