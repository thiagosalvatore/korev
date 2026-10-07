import * as Device from 'expo-device';
import { fetch as streamingFetch } from 'expo/fetch';
import * as SecureStore from 'expo-secure-store';
import type {
  KorevApi,
  KorevBridge,
  KorevEvents,
  Unsubscribe,
} from '../../korev-desktop/src/shared/api';
import type { RemotePairing } from '../../korev-desktop/src/shared/model';
import { parsePairing } from './pairing';
import { createSseParser, type ServerEvent } from './sse';

const PAIRING_KEY = 'korev-pairing';
const DEVICE_HEADER = 'X-Korev-Device';
const FALLBACK_DEVICE_NAME = 'Phone';
const HTTP_UNAUTHORIZED = 401;
const RECONNECT_DELAY_MS = 2000;

export class UnauthorizedError extends Error {}

export interface Connection extends KorevBridge {
  api: KorevApi;
  onConnect(listener: () => void): Unsubscribe;
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
): Promise<unknown> {
  const response = await fetch(`${pairing.url}/call`, {
    method: 'POST',
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

function apiFor(bridge: KorevBridge): KorevApi {
  return new Proxy({} as KorevApi, {
    get:
      (_target, method: string) =>
      (...args: unknown[]) =>
        bridge.call(method, args),
  });
}

export function connect(
  pairing: RemotePairing,
  onUnauthorized: () => void,
): Connection {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const connectListeners = new Set<() => void>();
  let controller: AbortController | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  let closed = false;

  function dispatch({ event, data }: ServerEvent) {
    const payload: unknown = JSON.parse(data);
    listeners.get(event)?.forEach((listener) => listener(payload));
  }

  async function readEvents(signal: AbortSignal) {
    const response = await streamingFetch(`${pairing.url}/events`, {
      headers: headers(pairing),
      signal,
    });
    if (response.status === HTTP_UNAUTHORIZED) throw new UnauthorizedError();
    if (!response.ok || !response.body) return;
    connectListeners.forEach((listener) => listener());
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const feed = createSseParser(dispatch);
    for (;;) {
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
    clearTimeout(retryTimer);
    controller?.abort();
    controller = new AbortController();
    void readEvents(controller.signal)
      .catch(handleFailure)
      .finally(() => {
        if (closed || attempt !== generation) return;
        retryTimer = setTimeout(open, RECONNECT_DELAY_MS);
      });
  }

  const bridge: KorevBridge = {
    async call(method, args) {
      try {
        return await call(pairing, method, args);
      } catch (error) {
        handleFailure(error);
        throw error;
      }
    },
    on<E extends keyof KorevEvents>(
      event: E,
      listener: (payload: KorevEvents[E]) => void,
    ) {
      const set = listeners.get(event) ?? new Set();
      listeners.set(event, set);
      const untyped = listener as (payload: unknown) => void;
      set.add(untyped);
      return () => set.delete(untyped);
    },
  };

  return {
    ...bridge,
    api: apiFor(bridge),
    onConnect(listener) {
      connectListeners.add(listener);
      return () => connectListeners.delete(listener);
    },
    open,
    close,
  };
}
