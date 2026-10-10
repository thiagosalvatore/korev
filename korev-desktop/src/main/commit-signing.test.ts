import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandResult, CommandRunner } from './command-runner';
import {
  enableCommitSigning,
  isSigningFailure,
  signingKey,
  SIGNING_SCOPE_FIX,
} from './commit-signing';
import { nodeFileSystem } from './file-system';

const PUBLIC_KEY = 'ecdsa-sha2-nistp256 AAAA korev\n';
const EMAIL = 'me@example.com';
const SECRETIVE_SIGNER = `${EMAIL} ecdsa-sha2-nistp256 BBBB secretive`;

const MISSING_SCOPE =
  'HTTP 404: Not Found (https://api.github.com/user/ssh_signing_keys)\n' +
  'This API operation needs the "admin:ssh_signing_key" scope.';

const SIGNER = '/app/korev-sign';

function result(exitCode: number, stdout = '', stderr = ''): CommandResult {
  return { exitCode, stdout, stderr };
}

function fakeRun(gh: CommandResult, gitConfig: Record<string, string> = {}) {
  return vi.fn<CommandRunner>(async (file, args) => {
    if (file === 'gh') return gh;
    if (file !== 'git') return result(0, PUBLIC_KEY);
    const value = gitConfig[args.at(-1)!];
    return value === undefined ? result(1) : result(0, `${value}\n`);
  });
}

describe('enabling commit signing', () => {
  let userData: string;

  beforeEach(async () => {
    userData = await mkdtemp(path.join(tmpdir(), 'korev-signing-'));
  });

  afterEach(async () => {
    await rm(userData, { recursive: true, force: true });
  });

  function enable(run: CommandRunner) {
    return enableCommitSigning(
      run,
      {},
      nodeFileSystem,
      signingKey(userData, SIGNER),
    );
  }

  it('creates the key once and registers it on GitHub as a signing key', async () => {
    const run = fakeRun(result(0));

    await expect(enable(run)).resolves.toEqual({ ok: true, value: undefined });
    await enable(run);

    const created = run.mock.calls.filter(([file]) => file === SIGNER);
    const added = run.mock.calls.filter(([file]) => file === 'gh');
    expect(created).toHaveLength(1);
    expect(added).toHaveLength(2);
    expect(added[0][1]).toEqual(
      expect.arrayContaining([
        'ssh-key',
        'add',
        path.join(userData, 'signing-key.pub'),
        '--type',
        'signing',
      ]),
    );
  });

  it('trusts the key in the allowed signers file once, keeping existing signers', async () => {
    const allowedSigners = path.join(userData, 'allowed_signers');
    await writeFile(allowedSigners, SECRETIVE_SIGNER);
    const run = fakeRun(result(0), {
      'gpg.ssh.allowedSignersFile': allowedSigners,
      'user.email': EMAIL,
    });

    await enable(run);
    await enable(run);

    await expect(readFile(allowedSigners, 'utf8')).resolves.toBe(
      `${SECRETIVE_SIGNER}\n${EMAIL} ${PUBLIC_KEY}`,
    );
  });

  it('tells the user how to grant gh the signing key scope', async () => {
    const run = fakeRun(result(1, '', MISSING_SCOPE));

    const enabled = await enable(run);

    expect(enabled).toMatchObject({ ok: false });
    expect(!enabled.ok && enabled.message).toContain(SIGNING_SCOPE_FIX);
  });
});

describe('signing failures in agent output', () => {
  it.each([
    "error: Couldn't sign message: agent refused operation\nfatal: failed to write commit object",
    'error: gpg failed to sign the data\nfatal: failed to write commit object',
  ])('recognises %s', (output) => {
    expect(isSigningFailure(output)).toBe(true);
  });

  it('ignores other git failures', () => {
    expect(isSigningFailure('nothing to commit, working tree clean')).toBe(
      false,
    );
  });
});
