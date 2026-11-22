import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { spawn as spawnPty } from 'node-pty';
import { renderUnicodeCompact } from 'uqr';
import { version } from '../package.json';
import type { DictationStatus, RemotePairing } from './shared/model';
import { runProcess } from './main/command-runner';
import { nodeFileSystem } from './main/file-system';
import { createIdleWatch } from './main/idle-exit';
import { createKorev, type Korev, type KorevDeps } from './main/korev';
import { childEnv, resolveLoginEnv } from './main/login-path';
import { notifyPhones } from './main/phone-notifications';
import {
  createRemoteAccess,
  remoteAccessFiles,
  type RemoteAccess,
  type RemoteSettings,
  type Tailnet,
} from './main/remote-access';
import { DEFAULT_REMOTE_PORT, LOOPBACK_HOST } from './main/remote-server';

const CLI_DIR = 'cli';
const DEFAULT_DATA_DIR = '.korev';
const DEFAULT_IDLE_EXIT_MINUTES = 15;
const MINUTE_MS = 60_000;
const IDLE_CHECK_INTERVAL_MS = MINUTE_MS;
const NOT_ON_CLOUD_MACHINE = 'Not available on a cloud machine';

const NO_TAILNET: Tailnet = {
  ip: () => null,
  loginUrl: () => null,
  error: () => null,
  close() {},
};

const NO_DICTATION: KorevDeps['dictation'] = {
  status: (): DictationStatus => ({
    status: 'failed',
    error: NOT_ON_CLOUD_MACHINE,
  }),
  prepare() {},
  transcribe: () => Promise.reject(new Error(NOT_ON_CLOUD_MACHINE)),
  cancel() {},
};

interface HeadlessConfig {
  dataDir: string;
  host: string;
  port: number;
  publicUrl: string;
  idleExitMs: number;
}

function readConfig(env: NodeJS.ProcessEnv): HeadlessConfig {
  const port = Number(env.KOREV_REMOTE_PORT ?? DEFAULT_REMOTE_PORT);
  const idleMinutes = Number(
    env.KOREV_IDLE_EXIT_MINUTES ?? DEFAULT_IDLE_EXIT_MINUTES,
  );
  return {
    dataDir: env.KOREV_DATA_DIR ?? path.join(homedir(), DEFAULT_DATA_DIR),
    host: env.KOREV_REMOTE_HOST ?? LOOPBACK_HOST,
    port,
    publicUrl: env.KOREV_PUBLIC_URL ?? `http://localhost:${port}`,
    idleExitMs: idleMinutes * MINUTE_MS,
  };
}

function alwaysOn(config: HeadlessConfig): RemoteSettings {
  return { remoteAccess: true, remotePort: config.port };
}

function showPairing(pairing: RemotePairing) {
  if (!process.stdout.isTTY) {
    console.log(`Korev is serving ${pairing.url}`);
    return;
  }
  const code = JSON.stringify(pairing);
  console.log(renderUnicodeCompact(code));
  console.log(`Scan with the Korev phone app, or paste: ${code}`);
}

function headlessDeps(
  config: HeadlessConfig,
  env: NodeJS.ProcessEnv,
  remote: RemoteAccess,
  korev: () => Korev | null,
): KorevDeps {
  return {
    run: runProcess,
    env,
    shell: process.env.SHELL,
    home: homedir(),
    userDataPath: config.dataDir,
    signer: '',
    cliDir: path.resolve(__dirname, '..', '..', CLI_DIR),
    fs: nodeFileSystem,
    spawnPty,
    emit: remote.broadcast,
    notify: (notice) =>
      void notifyPhones(
        remote,
        korev()?.settings().phoneNotificationsUrl ?? '',
        notice,
      ),
    playSound() {},
    isWindowFocused: () => false,
    setBadge() {},
    keepAwake() {},
    now: () => new Date(),
    newId: () => randomUUID(),
    chooseDirectory: async () => null,
    chooseSoundFile: async () => null,
    openPath: async () => {},
    showFileMenu() {},
    openExternal: async () => {},
    applyTheme() {},
    remote: { ...remote, apply: () => remote.apply(alwaysOn(config)) },
    dictation: NO_DICTATION,
    appVersion: version,
    fetchRelease: async () => null,
    installUpdate: async () => ({ ok: false, message: NOT_ON_CLOUD_MACHINE }),
  };
}

async function stop(korev: Korev, remote: RemoteAccess) {
  await Promise.all([korev.shutdown(), remote.close()]);
  process.exit(0);
}

function exitWhenIdle(
  config: HeadlessConfig,
  korev: Korev,
  remote: RemoteAccess,
) {
  if (config.idleExitMs <= 0) return;
  const watch = createIdleWatch(config.idleExitMs, Date.now);
  setInterval(() => {
    const idle = watch.shouldExit({
      runningAgents: korev.runningAgents(),
      connectedDevices: remote.status().devices.length,
    });
    if (idle) void stop(korev, remote);
  }, IDLE_CHECK_INTERVAL_MS);
}

async function main() {
  const config = readConfig(process.env);
  await mkdir(config.dataDir, { recursive: true });
  let korev: Korev | null = null;
  const remote = createRemoteAccess({
    ...remoteAccessFiles(config.dataDir),
    api: () => korev?.api ?? {},
    startTailnet: () => NO_TAILNET,
    onChange: () => korev?.emitState(),
    host: config.host,
    publicUrl: config.publicUrl,
  });
  const login = await resolveLoginEnv(runProcess, process.env);
  const env = childEnv(process.env, login);
  korev = await createKorev(headlessDeps(config, env, remote, () => korev));
  const started = korev;

  await remote.apply(alwaysOn(config));
  const pairing = await remote.pairing();
  if (!pairing)
    throw new Error(remote.status().error ?? 'Remote server did not start');
  showPairing(pairing);

  exitWhenIdle(config, started, remote);
  process.once('SIGTERM', () => void stop(started, remote));
  process.once('SIGINT', () => void stop(started, remote));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
