import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const streamingFetch = vi.hoisted(() => vi.fn());

vi.mock('expo/fetch', () => ({ fetch: streamingFetch }));
vi.mock('expo-device', () => ({ deviceName: 'Test phone' }));
vi.mock('expo-secure-store', () => ({}));

import {
  CONNECT_TIMEOUT_MS,
  IDLE_TIMEOUT_MS,
  connect,
  type Connection,
} from './connection';

const PAIRING = { url: 'http://mac.tailnet:7420', token: 'secret' };
const RECONNECT_DELAY_MS = 2000;

function abortable(signal: AbortSignal, onAbort: (error: Error) => void) {
  signal.addEventListener('abort', () => onAbort(new Error('aborted')));
}

function openStream(_url: string, { signal }: { signal: AbortSignal }) {
  const body = new ReadableStream({
    start(controller) {
      abortable(signal, (error) => controller.error(error));
    },
  });
  return Promise.resolve({ status: 200, ok: true, body });
}

function neverAnswer(_url: string, { signal }: { signal: AbortSignal }) {
  return new Promise((_resolve, reject) => abortable(signal, reject));
}

let connection: Connection;

function open() {
  connection = connect(PAIRING, () => undefined);
  connection.open();
}

beforeEach(() => {
  vi.useFakeTimers();
  streamingFetch.mockReset();
});

afterEach(() => {
  connection.close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('connection status', () => {
  it('starts out connecting', () => {
    streamingFetch.mockImplementation(neverAnswer);
    open();
    expect(connection.status()).toEqual({
      state: 'connecting',
      attempting: true,
    });
  });

  it('goes online when the event stream opens', async () => {
    streamingFetch.mockImplementation(openStream);
    open();
    await vi.advanceTimersByTimeAsync(0);
    expect(connection.status()).toEqual({ state: 'online', attempting: false });
  });

  it('goes offline when the Mac refuses the connection', async () => {
    streamingFetch.mockRejectedValue(new TypeError('Network request failed'));
    open();
    await vi.advanceTimersByTimeAsync(0);
    expect(connection.status()).toEqual({
      state: 'offline',
      attempting: false,
    });
  });

  it('goes offline when the Mac never answers', async () => {
    streamingFetch.mockImplementation(neverAnswer);
    open();
    await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS - 1);
    expect(connection.status().state).toBe('connecting');
    await vi.advanceTimersByTimeAsync(1);
    expect(connection.status().state).toBe('offline');
  });

  it('reconnects a silent stream without going offline', async () => {
    streamingFetch.mockImplementation(openStream);
    open();
    await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS + RECONNECT_DELAY_MS);
    expect(streamingFetch).toHaveBeenCalledTimes(2);
    expect(connection.status().state).toBe('online');
  });

  it('comes back online when a retry reaches the Mac', async () => {
    streamingFetch
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockImplementation(openStream);
    open();
    await vi.advanceTimersByTimeAsync(RECONNECT_DELAY_MS);
    expect(connection.status().state).toBe('online');
  });

  it('fails calls at once while offline', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    streamingFetch.mockRejectedValue(new TypeError('Network request failed'));
    open();
    await vi.advanceTimersByTimeAsync(0);
    await expect(connection.api.getState()).rejects.toThrow(
      'Not connected to Korev on your Mac.',
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
