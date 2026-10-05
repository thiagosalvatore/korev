import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runProcess, type CommandOptions } from './agents/command-runner';
import { createGitRemote } from './test-git-remote';
import {
  GIT_MESSAGES,
  UNUSED_CLONE_MS,
  createCheckouts,
  gitFailure,
  type CheckoutTarget,
} from './checkouts';

const REPO = 'acme/app';
const TARGET: CheckoutTarget = { repo: REPO, number: 7, baseRefName: 'main' };
const PUSH = { headRefName: 'feature', url: null };
const IDENTITY = '[user]\n  name = Maria\n  email = maria@example.com\n';

let scratch: string;

function sh(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    stdio: 'pipe',
    env: {
      ...process.env,
      HOME: join(scratch, 'home'),
      GIT_CONFIG_NOSYSTEM: '1',
    },
  })
    .toString()
    .trim();
}

function writeGitConfig(contents: string) {
  writeFileSync(join(scratch, 'home', '.gitconfig'), contents);
}

function createOrigin(): string {
  const remote = createGitRemote(scratch, REPO, { 'README.md': 'hello\n' }, [
    {
      number: 7,
      headRefName: 'feature',
      files: { 'feature.txt': 'feature\n' },
    },
  ]);
  return remote.gitUrl.replace('file://', '');
}

function setup(token: string | null = null, now = Date.now()) {
  const remote = createOrigin();
  const root = join(scratch, 'user-data');
  const checkouts = createCheckouts({
    run: runProcess,
    env: {
      ...process.env,
      HOME: join(scratch, 'home'),
      GIT_CONFIG_NOSYSTEM: '1',
    },
    root,
    gitUrl: `file://${remote}`,
    token: () => token,
    now: () => now,
  });
  return { checkouts, remote, root };
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'korev-checkouts-'));
  execFileSync('mkdir', ['-p', join(scratch, 'home')]);
  writeGitConfig(IDENTITY);
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe('checkouts', () => {
  it("checks out the pull request's head from refs/pull and pushes a new commit to its branch", async () => {
    const { checkouts, remote } = setup();

    const checkout = await checkouts.open(TARGET);
    writeFileSync(join(checkout.path, 'fix.txt'), 'fixed\n');
    expect(await checkouts.commitAll(checkout.path, 'Fix it')).toBe(true);
    const result = await checkouts.push(checkout, PUSH, false);

    expect(result).toEqual({ kind: 'pushed', sha: expect.any(String) });
    const origin = join(remote, `${REPO}.git`);
    expect(sh(origin, 'log', '-1', '--format=%s', 'feature')).toBe('Fix it');
    expect(sh(origin, 'rev-parse', 'feature^')).toBe(checkout.headOid);
  });

  it('pushes a fork pull request to the head repository URL', async () => {
    const { checkouts, remote } = setup();
    const fork = join(remote, 'forker/app.git');
    sh(remote, 'clone', '--bare', join(remote, `${REPO}.git`), fork);

    const checkout = await checkouts.open(TARGET);
    writeFileSync(join(checkout.path, 'fix.txt'), 'fixed\n');
    await checkouts.commitAll(checkout.path, 'Fix fork');
    await checkouts.push(
      checkout,
      { headRefName: 'feature', url: `file://${remote}/forker/app` },
      false,
    );

    expect(sh(fork, 'log', '-1', '--format=%s', 'feature')).toBe('Fix fork');
    expect(
      sh(join(remote, `${REPO}.git`), 'log', '-1', '--format=%s', 'feature'),
    ).toBe('Change for #7');
  });

  it('never runs the repo hooks', async () => {
    const { checkouts, root } = setup();
    const checkout = await checkouts.open(TARGET);
    const hook = join(root, 'repos', REPO, '.git', 'hooks', 'pre-commit');
    writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });

    writeFileSync(join(checkout.path, 'fix.txt'), 'fixed\n');

    await expect(checkouts.commitAll(checkout.path, 'Fix it')).resolves.toBe(
      true,
    );
  });

  it('reports that the head moved when someone pushed during the run', async () => {
    const { checkouts, remote } = setup();
    const checkout = await checkouts.open(TARGET);
    const other = join(scratch, 'other');
    sh(scratch, 'clone', '-b', 'feature', join(remote, `${REPO}.git`), other);
    writeFileSync(join(other, 'other.txt'), 'other\n');
    sh(other, 'add', '-A');
    sh(other, 'commit', '-m', 'someone else');
    sh(other, 'push', 'origin', 'feature');

    writeFileSync(join(checkout.path, 'fix.txt'), 'fixed\n');
    await checkouts.commitAll(checkout.path, 'Fix it');

    await expect(checkouts.push(checkout, PUSH, false)).rejects.toMatchObject({
      reason: 'head-moved',
    });
  });

  it('does not push changes to workflow files without the workflow scope', async () => {
    const { checkouts } = setup();
    const checkout = await checkouts.open(TARGET);
    execFileSync('mkdir', ['-p', join(checkout.path, '.github/workflows')]);
    writeFileSync(
      join(checkout.path, '.github/workflows/ci.yml'),
      'on: push\n',
    );
    await checkouts.commitAll(checkout.path, 'Touch CI');

    expect(await checkouts.push(checkout, PUSH, false)).toEqual({
      kind: 'workflow-files',
      files: ['.github/workflows/ci.yml'],
    });
  });

  it('refuses to commit unsigned when signing needs a prompt', async () => {
    const { checkouts } = setup();
    const checkout = await checkouts.open(TARGET);
    writeGitConfig(
      `${IDENTITY}[commit]\n  gpgsign = true\n[gpg]\n  program = /usr/bin/false\n`,
    );
    writeFileSync(join(checkout.path, 'fix.txt'), 'fixed\n');

    await expect(checkouts.commitAll(checkout.path, 'Fix it')).rejects.toThrow(
      GIT_MESSAGES.signing,
    );
  });

  it('asks for a git identity instead of guessing one', async () => {
    const { checkouts } = setup();
    const checkout = await checkouts.open(TARGET);
    writeGitConfig('[user]\n  useConfigOnly = true\n');
    writeFileSync(join(checkout.path, 'fix.txt'), 'fixed\n');

    await expect(checkouts.commitAll(checkout.path, 'Fix it')).rejects.toThrow(
      GIT_MESSAGES.noIdentity,
    );
  });

  it('removes clones of unwatched and long-unused repos, but keeps those a waiting task needs', async () => {
    const now = Date.now();
    const { checkouts, root } = setup(null, now);
    await checkouts.open(TARGET);
    const clone = join(root, 'repos', REPO);

    await checkouts.sweep([REPO], []);
    expect(existsSync(clone)).toBe(true);

    await checkouts.sweep([], [`${REPO}#7`]);
    expect(existsSync(clone)).toBe(true);

    const longAgo = new Date(now - UNUSED_CLONE_MS - 1000);
    utimesSync(clone, longAgo, longAgo);
    await checkouts.sweep([REPO], []);
    expect(existsSync(clone)).toBe(false);
    expect(existsSync(join(root, 'worktrees', REPO, '7'))).toBe(false);
  });

  it('removes everything except what a waiting task needs', async () => {
    const { checkouts, root } = setup();
    await checkouts.open(TARGET);
    expect(await checkouts.size()).toBeGreaterThan(0);

    await checkouts.removeAll([`${REPO}#7`]);
    expect(existsSync(join(root, 'worktrees', REPO, '7'))).toBe(true);

    await checkouts.removeAll([]);
    expect(existsSync(join(root, 'repos', REPO))).toBe(false);
    expect(await checkouts.size()).toBe(0);
  });
});

describe('git environment', () => {
  function fakeGit(version = 'git version 2.54.0') {
    return vi.fn(
      async (
        file: string,
        args: readonly string[],
        _options: CommandOptions,
      ) => {
        if (file !== 'git') {
          return {
            exitCode: 0,
            stdout: '__KOREV_PATH_START__/usr/bin__KOREV_PATH_END__',
            stderr: '',
          };
        }
        if (args[0] === '--version') {
          return { exitCode: 0, stdout: version, stderr: '' };
        }
        return { exitCode: 1, stdout: '', stderr: 'fatal: stop here' };
      },
    );
  }

  function checkoutsWith(run: ReturnType<typeof fakeGit>) {
    return createCheckouts({
      run,
      env: { HOME: '/Users/maria', GIT_ASKPASS: '/bin/askpass' },
      root: join(tmpdir(), 'korev-unused'),
      gitUrl: 'https://github.com',
      token: () => 'gho_secret',
      now: () => Date.now(),
    });
  }

  it('hands the token to git in its environment, never in its arguments, with prompts off', async () => {
    const run = fakeGit();

    await checkoutsWith(run)
      .open(TARGET)
      .catch(() => undefined);

    const gitCalls = run.mock.calls.filter(([file]) => file === 'git');
    expect(gitCalls.length).toBeGreaterThan(1);
    for (const [, args, options] of gitCalls) {
      expect(args.join(' ')).not.toContain('gho_secret');
      expect(options.env).toMatchObject({
        GIT_TERMINAL_PROMPT: '0',
        GCM_INTERACTIVE: 'never',
        GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
        GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from('x-access-token:gho_secret').toString('base64')}`,
      });
      expect(options.env).not.toHaveProperty('GIT_ASKPASS');
    }
  });

  it('asks for a newer git below 2.31', async () => {
    await expect(
      checkoutsWith(fakeGit('git version 2.30.1')).open(TARGET),
    ).rejects.toThrow(GIT_MESSAGES.oldGit);
  });

  it('shows the reason GitHub gave for refusing a protected branch', () => {
    const error = gitFailure(
      'remote: error: GH006: Protected branch update failed for refs/heads/main.\n! [remote rejected] HEAD -> main (protected branch hook declined)',
    );
    expect(error).toMatchObject({
      reason: 'protected',
      message: 'GH006: Protected branch update failed for refs/heads/main.',
    });
  });
});
