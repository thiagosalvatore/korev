import * as Device from 'expo-device';
import { fetch as streamingFetch } from 'expo/fetch';
import * as SecureStore from 'expo-secure-store';
import type {
  KorevApi,
  KorevBridge,
  Unsubscribe,
} from '../../korev-desktop/src/shared/api';
import type { RemotePairing } from '../../korev-desktop/src/shared/model';
import { apiFor, createEventListeners } from './bridge';
import { parsePairing } from './pairing';
import { createSseParser, type ServerEvent } from './sse';

const PAIRING_KEY = 'korev-pairing';
const DEVICE_HEADER = 'X-Korev-Device';
const FALLBACK_DEVICE_NAME = 'Phone';
const HTTP_UNAUTHORIZED = 401;
const RECONNECT_DELAY_MS = 2000;
export const CONNECT_TIMEOUT_MS = 8000;
export const IDLE_TIMEOUT_MS = 40_000;
const OFFLINE_MESSAGE = 'Not connected to Korev on your Mac.';

export class UnauthorizedError extends Error {}

export type ConnectionState = 'connecting' | 'online' | 'offline';

export interface ConnectionStatus {
  state: ConnectionState;
  attempting: boolean;
}

export interface Connection extends KorevBridge {
  api: KorevApi;
  onConnect(listener: () => void): Unsubscribe;
  status(): ConnectionStatus;
  onStatus(listener: () => void): Unsubscribe;
  open(): void;
  close(): void;
}

export async function loadPairing(): Promise<RemotePairing | null> {
  const saved = await SecureStore.getItemAsync(PAIRING_KEY);
  return saved ? parsePairing(saved) : null;
}

export function savePairing(pairing: RemotePairing): Promise<void> {
  return SecureStore.setItemAsync(PAIRING_KEY, JSON.stringify(pairing));
}

export function clearPairing(): Promise<void> {
  return SecureStore.deleteItemAsync(PAIRING_KEY);
}

function headers(pairing: RemotePairing): Record<string, string> {
  return {
    authorization: `Bearer ${pairing.token}`,
    [DEVICE_HEADER]: Device.deviceName ?? FALLBACK_DEVICE_NAME,
  };
}

export async function call(
  pairing: RemotePairing,
  method: string,
  args: unknown[],
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch(`${pairing.url}/call`, {
    method: 'POST',
    signal,
    headers: { ...headers(pairing), 'content-type': 'application/json' },
    body: JSON.stringify({ method, args }),
  });
  if (response.status === HTTP_UNAUTHORIZED)
    throw new UnauthorizedError('Korev no longer accepts this phone.');
  const body = (await response.json()) as { result?: unknown; error?: string };
  if (!response.ok)
    throw new Error(body.error ?? `Korev answered ${response.status}.`);
  return body.result;
}

function createWatchdog(onTimeout: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    arm(ms: number) {
      clearTimeout(timer);
      timer = setTimeout(onTimeout, ms);
    },
    stop() {
      clearTimeout(timer);
    },
  };
}

type Watchdog = ReturnType<typeof createWatchdog>;

export function connect(
  pairing: RemotePairing,
  onUnauthorized: () => void,
): Connection {
  const events = createEventListeners();
  const connectListeners = new Set<() => void>();
  const statusListeners = new Set<() => void>();
  let current: ConnectionStatus = { state: 'connecting', attempting: false };
  let controller: AbortController | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  let closed = false;

  function dispatch({ event, data }: ServerEvent) {
    events.emit(event, JSON.parse(data));
  }

  function setStatus(next: Partial<ConnectionStatus>) {
    const updated = { ...current, ...next };
    if (
      updated.state === current.state &&
      updated.attempting === current.attempting
    )
      return;
    current = updated;
    statusListeners.forEach((listener) => listener());
  }

  async function readEvents(
    signal: AbortSignal,
    watchdog: Watchdog,
    onReached: () => void,
  ) {
    watchdog.arm(CONNECT_TIMEOUT_MS);
    const response = await streamingFetch(`${pairing.url}/events`, {
      headers: headers(pairing),
      signal,
    });
    if (response.status === HTTP_UNAUTHORIZED) throw new UnauthorizedError();
    if (!response.ok || !response.body) return;
    onReached();
    connectListeners.forEach((listener) => listener());
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const feed = createSseParser(dispatch);
    for (;;) {
      watchdog.arm(IDLE_TIMEOUT_MS);
      const { done, value } = await reader.read();
      if (done) return;
      feed(decoder.decode(value, { stream: true }));
    }
  }

  function close() {
    closed = true;
    clearTimeout(retryTimer);
    controller?.abort();
  }

  function handleFailure(error: unknown) {
    if (!(error instanceof UnauthorizedError)) return;
    close();
    onUnauthorized();
  }

  function open() {
    closed = false;
    const attempt = ++generation;
    const isCurrent = () => attempt === generation && !closed;
    clearTimeout(retryTimer);
    controller?.abort();
    const attemptController = new AbortController();
    controller = attemptController;
    const watchdog = createWatchdog(() => attemptController.abort());
    let reached = false;
    setStatus({ attempting: true });
    void readEvents(attemptController.signal, watchdog, () => {
      reached = true;
      if (isCurrent()) setStatus({ state: 'online', attempting: false });
    })
      .catch(handleFailure)
      .finally(() => {
        watchdog.stop();
        if (!isCurrent()) return;
        setStatus(
          reached
            ? { attempting: false }
            : { state: 'offline', attempting: false },
        );
        retryTimer = setTimeout(open, RECONNECT_DELAY_MS);
      });
  }

  const bridge: KorevBridge = {
    async call(method, args) {
      if (current.state === 'offline') throw new Error(OFFLINE_MESSAGE);
      try {
        return await call(pairing, method, args);
      } catch (error) {
        handleFailure(error);
        throw error;
      }
    },
    on: events.on,
  };

  return {
    ...bridge,
    api: apiFor(bridge),
    onConnect(listener) {
      connectListeners.add(listener);
      return () => connectListeners.delete(listener);
    },
    status: () => current,
    onStatus(listener) {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    open,
    close,
  };
}
