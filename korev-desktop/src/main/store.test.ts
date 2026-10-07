import { describe, expect, it } from 'vitest';
import type { FileSystem } from './file-system';
import { openStore } from './store';

function fileSystemWith(state: unknown): FileSystem {
  return {
    read: async () => Buffer.from(JSON.stringify(state)),
    writeAtomic: async () => undefined,
    remove: async () => undefined,
    link: async () => undefined,
    makeDir: async () => undefined,
  };
}

describe('openStore', () => {
  it('turns a saved single run script into a named run script list', async () => {
    const store = await openStore(
      fileSystemWith({
        repos: [
          { id: 'a', scripts: { run: 'npm start' } },
          { id: 'b', scripts: { run: '  ' } },
        ],
      }),
      '/user-data',
      '/home',
    );
    expect(store.state.repos.map((repo) => repo.scripts.run)).toEqual([
      [{ name: 'run', command: 'npm start' }],
      [],
    ]);
  });
});
