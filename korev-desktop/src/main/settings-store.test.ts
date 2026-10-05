import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../shared/settings';
import { createMemoryFileSystem } from './file-system';
import { createSettingsStore } from './settings-store';

const PATH = '/user-data/settings.json';

describe('settings store', () => {
  it('returns defaults when the file is missing', async () => {
    const store = createSettingsStore({
      fs: createMemoryFileSystem(),
      path: PATH,
    });
    expect(await store.load()).toEqual({
      settings: DEFAULT_SETTINGS,
      problem: null,
    });
  });

  it('falls back to defaults and reports a problem for corrupt JSON', async () => {
    const fs = createMemoryFileSystem({ [PATH]: '{"repos": [' });
    const result = await createSettingsStore({ fs, path: PATH }).load();
    expect(result.settings).toEqual(DEFAULT_SETTINGS);
    expect(result.problem).not.toBeNull();
  });

  it('drops invalid values while keeping valid ones', async () => {
    const fs = createMemoryFileSystem({
      [PATH]: JSON.stringify({
        repos: ['acme/api', 'not a repo', 'acme/api', 42],
        theme: 'sepia',
        lastView: 'ready',
        collapsedSections: { ready: true, 'acme/web': true, approved: 'yes' },
        repoFilter: { mine: ['acme/api', 'acme/gone'], review: 'acme/api' },
        keptPrs: {
          'acme/api#7': '2026-10-01T00:00:00.000Z',
          'acme/api': '2026-10-01T00:00:00.000Z',
          'acme/api#8': 'soon',
        },
      }),
    });
    const { settings } = await createSettingsStore({ fs, path: PATH }).load();
    expect(settings.repos).toEqual(['acme/api']);
    expect(settings.theme).toBe('system');
    expect(settings.lastView).toBe('ready');
    expect(settings.collapsedSections).toEqual({ ready: true });
    expect(settings.repoFilter).toEqual({ mine: ['acme/api'], review: [] });
    expect(settings.keptPrs).toEqual({
      'acme/api#7': '2026-10-01T00:00:00.000Z',
    });
  });

  it('opens Open for a last view saved as My PRs', async () => {
    const fs = createMemoryFileSystem({
      [PATH]: JSON.stringify({ lastView: 'mine' }),
    });
    const { settings } = await createSettingsStore({ fs, path: PATH }).load();
    expect(settings.lastView).toBe('open');
  });

  it('keeps only known agents and model ids that cannot pass as a flag', async () => {
    const fs = createMemoryFileSystem({
      [PATH]: JSON.stringify({
        agent: {
          provider: 'gemini',
          models: { claude: 'opus', codex: '--yolo', gemini: 'pro' },
        },
      }),
    });
    const { settings } = await createSettingsStore({ fs, path: PATH }).load();
    expect(settings.agent).toEqual({
      provider: null,
      models: { claude: 'opus' },
    });
  });

  it('keeps instructions only for known tasks and an explain format it knows', async () => {
    const fs = createMemoryFileSystem({
      [PATH]: JSON.stringify({
        aiTasks: {
          explainFormat: 'pdf',
          instructions: {
            explain: '/pr-review',
            deploy: 'ship it',
            review: '  ',
          },
        },
      }),
    });
    const { settings } = await createSettingsStore({ fs, path: PATH }).load();
    expect(settings.aiTasks).toEqual({
      keepMergeable: { allMine: false, prs: {} },
      keepMergeableIntroSeen: false,
      notify: true,
      explainFormat: 'html',
      instructions: { explain: '/pr-review' },
    });
  });

  it('persists updates so a new store reads them back', async () => {
    const fs = createMemoryFileSystem();
    await createSettingsStore({ fs, path: PATH }).update({
      repos: ['acme/web'],
      theme: 'dark',
    });
    const { settings } = await createSettingsStore({ fs, path: PATH }).load();
    expect(settings).toMatchObject({ repos: ['acme/web'], theme: 'dark' });
  });
});
