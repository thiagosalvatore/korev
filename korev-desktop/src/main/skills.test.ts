import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { listSkills, pluginCommands } from './skills';

let root: string;

async function addSkill(dir: string, name: string) {
  await mkdir(path.join(dir, name), { recursive: true });
  await writeFile(path.join(dir, name, 'SKILL.md'), `# ${name}`);
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'korev-skills-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

it('lists skills from both agents and the repository, once per name', async () => {
  const home = path.join(root, 'home');
  const repo = path.join(root, 'repo');
  await addSkill(path.join(home, '.claude', 'skills'), 'pr-review');
  await addSkill(path.join(home, '.codex', 'skills'), 'pr-review');
  await addSkill(path.join(repo, '.agents', 'skills'), 'repo-only');
  await mkdir(path.join(home, '.claude', 'skills', 'not-a-skill'));

  expect(await listSkills(home, repo)).toEqual([
    { name: 'pr-review', agents: ['claude', 'codex'] },
    { name: 'repo-only', agents: ['codex'] },
  ]);
});

it('lists the skills and commands of enabled Claude Code plugins', async () => {
  const home = path.join(root, 'home');
  const repo = path.join(root, 'repo');
  const plugins = path.join(home, '.claude', 'plugins');
  const install = (name: string) => path.join(plugins, 'cache', name);
  for (const name of ['mine', 'here', 'off', 'elsewhere'])
    await addSkill(path.join(install(name), 'skills'), 'plan');
  await mkdir(path.join(install('mine'), 'commands'), { recursive: true });
  await writeFile(path.join(install('mine'), 'commands', 'ship.md'), '');
  await writeFile(path.join(install('mine'), 'commands', 'notes.txt'), '');
  await writeFile(
    path.join(plugins, 'installed_plugins.json'),
    JSON.stringify({
      plugins: {
        'mine@market': [{ scope: 'user', installPath: install('mine') }],
        'here@market': [
          { scope: 'project', projectPath: repo, installPath: install('here') },
        ],
        'off@market': [{ scope: 'user', installPath: install('off') }],
        'elsewhere@market': [
          {
            scope: 'project',
            projectPath: path.join(root, 'other'),
            installPath: install('elsewhere'),
          },
        ],
      },
    }),
  );
  await writeFile(
    path.join(home, '.claude', 'settings.json'),
    JSON.stringify({ enabledPlugins: { 'off@market': false } }),
  );

  expect(await pluginCommands(home, repo)).toEqual([
    'mine:plan',
    'mine:ship',
    'here:plan',
  ]);
});

it('lists no plugin commands when Claude Code has no plugins', async () => {
  expect(await pluginCommands(path.join(root, 'home'), root)).toEqual([]);
});
