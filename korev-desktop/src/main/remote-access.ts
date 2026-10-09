import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import type { KorevApi, KorevEvents } from '../shared/api';
import type { RemotePairing, RemoteStatus, Settings } from '../shared/model';
import {
  LOOPBACK_HOST,
  startRemoteServer,
  type RemoteServer,
} from './remote-server';

const TOKEN_BYTES = 32;
const TOKEN_FILE_MODE = 0o600;
const PUSH_TOKEN_PATTERN = /^Expo(nent)?PushToken\[[^\]]+\]$/;

export type RemoteSettings = Pick<Settings, 'remoteAccess' | 'remotePort'>;

export interface Tailnet {
  ip(): string | null;
  loginUrl(): string | null;
  error(): string | null;
  close(): void;
}

export type StartTailnet = (port: number, onChange: () => void) => Tailnet;

export interface RemoteAccessOptions {
  tokenPath: string;
  pushTokensPath: string;
  api(): Partial<KorevApi>;
  startTailnet: StartTailnet;
  onChange(): void;
}

export interface RemoteAccess {
  status(): RemoteStatus;
  pairing(): Promise<RemotePairing | null>;
  apply(settings: RemoteSettings): Promise<void>;
  revoke(): Promise<void>;
  pushTokens(): Promise<string[]>;
  registerPushToken(token: string): Promise<void>;
  unregisterPushToken(token: string): Promise<void>;
  broadcast<E extends keyof KorevEvents>(
    event: E,
    payload: KorevEvents[E],
  ): void;
  close(): Promise<void>;
}

async function writeNewToken(tokenPath: string): Promise<string> {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  await writeFile(tokenPath, token, { mode: TOKEN_FILE_MODE });
  return token;
}

async function loadToken(tokenPath: string): Promise<string> {
  const saved = (await readFile(tokenPath, 'utf8').catch(() => '')).trim();
  return saved || writeNewToken(tokenPath);
}

function isPushToken(token: unknown): token is string {
  return typeof token === 'string' && PUSH_TOKEN_PATTERN.test(token);
}

async function loadPushTokens(pushTokensPath: string): Promise<string[]> {
  try {
    const saved: unknown = JSON.parse(await readFile(pushTokensPath, 'utf8'));
    return Array.isArray(saved) ? saved.filter(isPushToken) : [];
  } catch {
    return [];
  }
}

export function createRemoteAccess(options: RemoteAccessOptions): RemoteAccess {
  let server: RemoteServer | null = null;
  let tailnet: Tailnet | null = null;
  let error: string | null = null;
  let settings: RemoteSettings | null = null;
  let pushTokenUpdates = Promise.resolve();

  function updatePushTokens(change: (tokens: string[]) => string[]) {
    const update = pushTokenUpdates.then(async () => {
      const tokens = change(await loadPushTokens(options.pushTokensPath));
      await writeFile(options.pushTokensPath, JSON.stringify(tokens), {
        mode: TOKEN_FILE_MODE,
      });
    });
    pushTokenUpdates = update.catch(() => undefined);
    return update;
  }

  async function stop() {
    tailnet?.close();
    tailnet = null;
    await server?.close();
    server = null;
  }

  async function start(current: RemoteSettings) {
    try {
      server = await startRemoteServer({
        api: options.api(),
        token: await loadToken(options.tokenPath),
        host: LOOPBACK_HOST,
        port: current.remotePort,
        onDevicesChange: options.onChange,
      });
      tailnet = options.startTailnet(server.port, options.onChange);
    } catch (failure) {
      error = failure instanceof Error ? failure.message : String(failure);
    }
  }

  function address(): string | null {
    const ip = tailnet?.ip();
    return server && ip ? `${ip}:${server.port}` : null;
  }

  async function apply(next: RemoteSettings) {
    settings = { ...next };
    await stop();
    error = null;
    if (next.remoteAccess) await start(next);
    options.onChange();
  }

  return {
    status: () => ({
      address: address(),
      devices: server?.devices() ?? [],
      loginUrl: tailnet?.loginUrl() ?? null,
      error: error ?? tailnet?.error() ?? null,
    }),
    async pairing() {
      const current = address();
      if (!current) return null;
      return {
        url: `http://${current}`,
        token: await loadToken(options.tokenPath),
      };
    },
    apply,
    async revoke() {
      await writeNewToken(options.tokenPath);
      await updatePushTokens(() => []);
      if (settings) await apply(settings);
    },
    pushTokens: () => loadPushTokens(options.pushTokensPath),
    async registerPushToken(token) {
      if (!isPushToken(token)) throw new Error('Not an Expo push token');
      await updatePushTokens((tokens) =>
        tokens.includes(token) ? tokens : [...tokens, token],
      );
    },
    unregisterPushToken: (token) =>
      updatePushTokens((tokens) => tokens.filter((saved) => saved !== token)),
    broadcast: (event, payload) => server?.broadcast(event, payload),
    close: stop,
  };
}
