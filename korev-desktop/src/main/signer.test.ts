import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signingEnv, signingKey } from './commit-signing';

const run = promisify(execFile);
const SIGNER_SOURCE = path.join(__dirname, '../../signer/main.swift');
const COMPILE_TIMEOUT_MS = 180_000;
const PRINCIPAL = 'korev@example.com';
const NAMESPACE = 'git';

let dir: string;
let signer: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'korev-signer-'));
  signer = path.join(dir, 'korev-sign');
  await run('swiftc', ['-O', '-o', signer, SIGNER_SOURCE]);
}, COMPILE_TIMEOUT_MS);

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function createKey(
  name: string,
): Promise<{ blob: string; publicKey: string }> {
  const blob = path.join(dir, `${name}.blob`);
  const { stdout } = await run(signer, ['create', blob, '--software']);
  return { blob, publicKey: stdout.trim() };
}

describe('korev-sign', () => {
  it('writes a signature that ssh-keygen verifies through the helper', async () => {
    const { blob, publicKey } = await createKey('verify');
    const publicKeyFile = path.join(dir, 'verify.pub');
    const allowedSigners = path.join(dir, 'allowed_signers');
    const message = path.join(dir, 'message');
    await writeFile(publicKeyFile, `${publicKey}\n`);
    await writeFile(allowedSigners, `${PRINCIPAL} ${publicKey}\n`);
    await writeFile(message, 'tree 0000\n\ncommit message\n');

    await run(
      signer,
      ['-Y', 'sign', '-n', NAMESPACE, '-f', publicKeyFile, '-U', message],
      {
        env: { ...process.env, KOREV_SIGNING_KEY: blob },
      },
    );

    const verify = run(signer, [
      '-Y',
      'verify',
      '-f',
      allowedSigners,
      '-I',
      PRINCIPAL,
      '-n',
      NAMESPACE,
      '-s',
      `${message}.sig`,
    ]);
    verify.child.stdin?.end(await readFile(message));
    await expect(verify).resolves.toMatchObject({
      stdout: expect.stringContaining('Good "git" signature'),
    });
  });

  it('refuses to overwrite an existing key', async () => {
    const { blob } = await createKey('existing');

    await expect(run(signer, ['create', blob, '--software'])).rejects.toThrow();
  });
});

describe('agent commits with the Korev key', () => {
  it('signs a commit even when the user signs with another program', async () => {
    const key = signingKey(dir, signer);
    const { stdout: publicKey } = await run(signer, [
      'create',
      key.key,
      '--software',
    ]);
    await writeFile(key.publicKey, publicKey);
    const allowedSigners = path.join(dir, 'agent_allowed_signers');
    await writeFile(allowedSigners, `${PRINCIPAL} ${publicKey}`);
    const repo = path.join(dir, 'repo');
    const env = { ...process.env, ...signingEnv(key) };
    const git = (...args: string[]) => run('git', args, { cwd: repo, env });
    await run('git', ['init', '-q', repo]);
    await git('config', 'gpg.ssh.program', '/nonexistent/op-ssh-sign');

    await git(
      '-c',
      `user.email=${PRINCIPAL}`,
      '-c',
      'user.name=Korev',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'signed by the agent',
    );

    const { stdout } = await git(
      '-c',
      `gpg.ssh.allowedSignersFile=${allowedSigners}`,
      'log',
      '--format=%G?',
    );
    expect(stdout.trim()).toBe('G');
  });
});
