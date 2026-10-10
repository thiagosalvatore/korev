import { mkdtemp, rm } from 'node:fs/promises';
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
const MISSING_SCOPE =
  'HTTP 404: Not Found (https://api.github.com/user/ssh_signing_keys)\n' +
  'This API operation needs the "admin:ssh_signing_key" scope.';

function result(exitCode: number, stdout = '', stderr = ''): CommandResult {
  return { exitCode, stdout, stderr };
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
      signingKey(userData, '/app/korev-sign'),
    );
  }

  it('creates the key once and registers it on GitHub as a signing key', async () => {
    const run = vi.fn<CommandRunner>(async (file) =>
      file === 'gh' ? result(0) : result(0, PUBLIC_KEY),
    );

    await expect(enable(run)).resolves.toEqual({ ok: true, value: undefined });
    await enable(run);

    const created = run.mock.calls.filter(([file]) => file !== 'gh');
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

  it('tells the user how to grant gh the signing key scope', async () => {
    const run = vi.fn<CommandRunner>(async (file) =>
      file === 'gh' ? result(1, '', MISSING_SCOPE) : result(0, PUBLIC_KEY),
    );

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
