import { describe, expect, it } from 'vitest';
import type { SecretCipher } from '../encrypted-file';
import { createMemoryFileSystem } from '../file-system';
import {
  createExplanations,
  explanationBody,
  type StoredExplanation,
} from './explanations';

const PATH = '/user-data/explanations.bin';
const PREFIX = 'enc:';
const cipher: SecretCipher = {
  isAvailable: async () => true,
  storageBackend: () => 'keychain',
  encrypt: async (plainText) =>
    Buffer.from(PREFIX + Buffer.from(plainText).toString('base64')),
  decrypt: async (encrypted) => ({
    result: Buffer.from(
      encrypted.toString().slice(PREFIX.length),
      'base64',
    ).toString(),
    shouldReEncrypt: false,
  }),
};

const EXPLANATION: StoredExplanation = {
  headOid: 'f00dcafe',
  format: 'markdown',
  document: '# Secret plan\n\nUses `retry()`.',
  createdAt: '2026-10-04T10:00:00.000Z',
};

describe('explanations', () => {
  it('keeps explanations encrypted at rest and reads them back for the same account', async () => {
    const fs = createMemoryFileSystem();
    const first = createExplanations({ cipher, fs, path: PATH });
    await first.load('maria');
    await first.save('acme/api#301', EXPLANATION);

    expect(fs.files.get(PATH)?.toString()).not.toContain('Secret plan');

    const second = createExplanations({ cipher, fs, path: PATH });
    await second.load('maria');
    expect(second.get('acme/api#301')).toEqual(EXPLANATION);

    const other = createExplanations({ cipher, fs, path: PATH });
    await other.load('octocat');
    expect(other.get('acme/api#301')).toBeNull();
  });

  it('removes saved explanations when cleared', async () => {
    const fs = createMemoryFileSystem();
    const explanations = createExplanations({ cipher, fs, path: PATH });
    await explanations.load('maria');
    await explanations.save('acme/api#301', EXPLANATION);

    await explanations.clear();

    expect(fs.files.has(PATH)).toBe(false);
    expect(explanations.get('acme/api#301')).toBeNull();
  });

  it('renders a Markdown explanation as HTML', () => {
    expect(explanationBody(EXPLANATION)).toBe(
      '<h1>Secret plan</h1>\n<p>Uses <code>retry()</code>.</p>\n',
    );
  });
});
