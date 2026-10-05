import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const IDENTITY = '[user]\n  name = Maria\n  email = maria@example.com\n';

export interface PullSpec {
  number: number;
  headRefName: string;
  files: Record<string, string>;
}

export interface GitRemote {
  gitUrl: string;
  home: string;
  headOids: Record<number, string>;
  git(...args: string[]): string;
}

function writeFiles(dir: string, files: Record<string, string>) {
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), contents);
  }
}

export function createGitRemote(
  root: string,
  repo: string,
  base: Record<string, string>,
  pulls: PullSpec[],
): GitRemote {
  const home = join(root, 'home');
  const remotes = join(root, 'remotes');
  const origin = join(remotes, `${repo}.git`);
  const seed = join(root, 'seed');
  mkdirSync(home, { recursive: true });
  mkdirSync(origin, { recursive: true });
  mkdirSync(seed, { recursive: true });
  writeFileSync(join(home, '.gitconfig'), IDENTITY);
  const run = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, {
      cwd,
      stdio: 'pipe',
      env: { ...process.env, HOME: home, GIT_CONFIG_NOSYSTEM: '1' },
    })
      .toString()
      .trim();

  run(origin, 'init', '--bare', '-b', 'main');
  run(seed, 'init', '-b', 'main');
  writeFiles(seed, base);
  run(seed, 'add', '-A');
  run(seed, 'commit', '-m', 'Base');
  run(seed, 'push', origin, 'main');
  const headOids: Record<number, string> = {};
  for (const pull of pulls) {
    run(seed, 'switch', '-c', pull.headRefName, 'main');
    writeFiles(seed, pull.files);
    run(seed, 'add', '-A');
    run(seed, 'commit', '-m', `Change for #${pull.number}`);
    run(
      seed,
      'push',
      origin,
      `${pull.headRefName}:${pull.headRefName}`,
      `${pull.headRefName}:refs/pull/${pull.number}/head`,
    );
    headOids[pull.number] = run(seed, 'rev-parse', 'HEAD');
  }
  return {
    gitUrl: `file://${remotes}`,
    home,
    headOids,
    git: (...args) => run(origin, ...args),
  };
}
