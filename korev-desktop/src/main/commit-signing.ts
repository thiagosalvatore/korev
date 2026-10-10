import { hostname } from 'node:os';
import path from 'node:path';
import type { Result } from '../shared/model';
import type { CommandRunner } from './command-runner';
import type { FileSystem } from './file-system';

const KEY_FILE = 'signing-key';
const PUBLIC_KEY_FILE = `${KEY_FILE}.pub`;
const KEY_PATH_VARIABLE = 'KOREV_SIGNING_KEY';
const SIGNING_SCOPE = 'admin:ssh_signing_key';
const COMMAND_TIMEOUT_MS = 30_000;
const SIGNING_FAILURE = /Couldn't sign message|failed to sign the data/;
const ALLOWED_SIGNERS_SETTING = 'gpg.ssh.allowedSignersFile';
const EMAIL_SETTING = 'user.email';

export const SIGNING_SCOPE_FIX = `gh auth refresh -h github.com -s ${SIGNING_SCOPE}`;
export const SIGNING_NUDGE =
  "Commit signing failed, probably because your Mac is locked. Turn on 'Sign agent commits with a Korev key' in Settings on your Mac.";

export interface SigningKey {
  signer: string;
  key: string;
  publicKey: string;
}

export function signingKey(userDataPath: string, signer: string): SigningKey {
  return {
    signer,
    key: path.join(userDataPath, KEY_FILE),
    publicKey: path.join(userDataPath, PUBLIC_KEY_FILE),
  };
}

export function signingEnv(key: SigningKey): NodeJS.ProcessEnv {
  const config = [
    ['gpg.format', 'ssh'],
    ['gpg.ssh.program', key.signer],
    ['user.signingKey', key.publicKey],
    ['commit.gpgSign', 'true'],
  ];
  const entries = config.flatMap(([name, value], index) => [
    [`GIT_CONFIG_KEY_${index}`, name],
    [`GIT_CONFIG_VALUE_${index}`, value],
  ]);
  return {
    [KEY_PATH_VARIABLE]: key.key,
    GIT_CONFIG_COUNT: String(config.length),
    ...Object.fromEntries(entries),
  };
}

export function isSigningFailure(output: string): boolean {
  return SIGNING_FAILURE.test(output);
}

async function createKey(
  run: CommandRunner,
  env: NodeJS.ProcessEnv,
  fs: FileSystem,
  key: SigningKey,
): Promise<Result> {
  if (await fs.read(key.publicKey)) return { ok: true, value: undefined };
  const created = await run(key.signer, ['create', key.key], {
    env,
    timeoutMs: COMMAND_TIMEOUT_MS,
  });
  if (created.exitCode !== 0)
    return {
      ok: false,
      message: created.stderr.trim() || 'Could not create a signing key',
    };
  await fs.writeAtomic(key.publicKey, created.stdout);
  return { ok: true, value: undefined };
}

async function addToGithub(
  run: CommandRunner,
  env: NodeJS.ProcessEnv,
  key: SigningKey,
): Promise<Result> {
  const added = await run(
    'gh',
    [
      'ssh-key',
      'add',
      key.publicKey,
      '--type',
      'signing',
      '--title',
      `Korev on ${hostname()}`,
    ],
    { env, timeoutMs: COMMAND_TIMEOUT_MS },
  );
  if (added.exitCode === 0) return { ok: true, value: undefined };
  if (added.stderr.includes(SIGNING_SCOPE))
    return {
      ok: false,
      message: `gh needs permission to add signing keys. Run: ${SIGNING_SCOPE_FIX}`,
    };
  return {
    ok: false,
    message: added.stderr.trim() || 'Could not add the signing key to GitHub',
  };
}

async function gitConfig(
  run: CommandRunner,
  env: NodeJS.ProcessEnv,
  args: string[],
): Promise<string> {
  const read = await run('git', ['config', '--get', ...args], {
    env,
    timeoutMs: COMMAND_TIMEOUT_MS,
  });
  return read.exitCode === 0 ? read.stdout.trim() : '';
}

function lineBreakBefore(text: string): string {
  return text && !text.endsWith('\n') ? '\n' : '';
}

async function trustLocally(
  run: CommandRunner,
  env: NodeJS.ProcessEnv,
  fs: FileSystem,
  key: SigningKey,
): Promise<void> {
  const allowedSigners = await gitConfig(run, env, [
    '--path',
    ALLOWED_SIGNERS_SETTING,
  ]);
  const email = await gitConfig(run, env, [EMAIL_SETTING]);
  if (!allowedSigners || !email) return;
  const publicKey = String(await fs.read(key.publicKey)).trim();
  const signers = String((await fs.read(allowedSigners)) ?? '');
  const [, keyBlob] = publicKey.split(' ');
  if (signers.includes(keyBlob)) return;
  await fs.append(
    allowedSigners,
    `${lineBreakBefore(signers)}${email} ${publicKey}\n`,
  );
}

export async function enableCommitSigning(
  run: CommandRunner,
  env: NodeJS.ProcessEnv,
  fs: FileSystem,
  key: SigningKey,
): Promise<Result> {
  const created = await createKey(run, env, fs, key);
  if (!created.ok) return created;
  const added = await addToGithub(run, env, key);
  if (added.ok) await trustLocally(run, env, fs, key);
  return added;
}
