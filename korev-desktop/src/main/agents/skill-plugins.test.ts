import { describe, expect, it } from 'vitest';
import { createMemoryFileSystem } from '../file-system';
import { linkSkillPlugins } from './skill-plugins';

const HOME = '/Users/maria';
const SCRATCH = '/tmp/korev';
const INSTALLED = `${HOME}/.claude/plugins/installed_plugins.json`;
const SETTINGS = `${HOME}/.claude/settings.json`;
const CACHE = `${HOME}/.claude/plugins/cache`;

function installed(scope: string, installPath: string) {
  return [{ scope, installPath, version: '1.0.0' }];
}

describe('linkSkillPlugins', () => {
  it("links the user's skills and the skills of each enabled user plugin, and nothing else", async () => {
    const fs = createMemoryFileSystem({
      [INSTALLED]: JSON.stringify({
        version: 2,
        plugins: {
          'compound-engineering@market': installed('user', `${CACHE}/ce/3.0`),
          'slack@official': installed('user', `${CACHE}/slack/1.3`),
          'typescript-lsp@official': installed('project', `${CACHE}/ts/1.0`),
        },
      }),
      [SETTINGS]: JSON.stringify({
        enabledPlugins: {
          'compound-engineering@market': true,
          'slack@official': false,
          'typescript-lsp@official': true,
        },
      }),
    });

    const pluginDirs = await linkSkillPlugins({
      fs,
      home: HOME,
      scratchDir: SCRATCH,
    });

    expect(pluginDirs).toEqual([
      `${SCRATCH}/claude-skills/user-skills`,
      `${SCRATCH}/claude-skills/compound-engineering`,
    ]);
    expect(Object.fromEntries(fs.links)).toEqual({
      [`${SCRATCH}/claude-skills/user-skills/skills`]: `${HOME}/.claude/skills`,
      [`${SCRATCH}/claude-skills/compound-engineering/skills`]: `${CACHE}/ce/3.0/skills`,
    });
  });

  it("still links the user's skills when the plugin files are missing or unreadable", async () => {
    const fs = createMemoryFileSystem({ [INSTALLED]: '{not json' });

    const pluginDirs = await linkSkillPlugins({
      fs,
      home: HOME,
      scratchDir: SCRATCH,
    });

    expect(pluginDirs).toEqual([`${SCRATCH}/claude-skills/user-skills`]);
  });
});
