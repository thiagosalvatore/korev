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

  it('treats a workspace saved before linked lanes as not awaiting one', async () => {
    const store = await openStore(
      fileSystemWith({ workspaces: [{ sessions: [] }] }),
      '/user-data',
      '/home',
    );
    expect(store.state.workspaces[0].awaitsLane).toBe(false);
  });

  it('has not seen any version yet on a fresh install', async () => {
    const store = await openStore(fileSystemWith({}), '/user-data', '/home');
    expect(store.state.settings.lastSeenVersion).toBeNull();
  });

  it('stops pinning codex to the old default model placeholder', async () => {
    const store = await openStore(
      fileSystemWith({
        settings: { defaultModels: { claude: 'opus', codex: 'default' } },
        workspaces: [{ sessions: [{ agent: 'codex', model: 'default' }] }],
      }),
      '/user-data',
      '/home',
    );
    expect(store.state.settings.defaultModels.codex).toBe('');
    expect(store.state.workspaces[0].sessions[0].model).toBe('');
  });
});
