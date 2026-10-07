import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { listSkills } from './skills';

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
