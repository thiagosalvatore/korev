import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { repoFavicon } from './repo-icon';

describe('repo icons', () => {
  let repo: string;

  beforeEach(async () => {
    repo = await mkdtemp(path.join(tmpdir(), 'korev-icon-'));
    execFileSync('git', ['init', '-q', repo]);
  });

  afterEach(async () => {
    await rm(repo, { recursive: true, force: true });
  });

  it('reads a favicon from the repo as a data URL', async () => {
    await mkdir(path.join(repo, 'public'));
    await writeFile(path.join(repo, 'public', 'favicon.svg'), '<svg/>');

    expect(await repoFavicon(repo)).toBe(
      `data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}`,
    );
  });

  it('has no favicon when the repo has no icon file', async () => {
    expect(await repoFavicon(repo)).toBeNull();
  });
});
