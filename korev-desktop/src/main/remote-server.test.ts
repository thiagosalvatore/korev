import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HEARTBEAT_MS,
  startRemoteServer,
  type RemoteServer,
} from './remote-server';

const TOKEN = 'secret-token';
const LOOPBACK = '127.0.0.1';
const ANY_FREE_PORT = 0;
const PING = ': ping\n\n';

let server: RemoteServer | null = null;

afterEach(async () => {
  await server?.close();
  server = null;
});

async function start(
  api: Record<string, (...args: never[]) => unknown>,
  onDevicesChange = () => undefined,
) {
  server = await startRemoteServer({
    api,
    token: TOKEN,
    host: LOOPBACK,
    port: ANY_FREE_PORT,
    onDevicesChange,
  });
  return `http://${LOOPBACK}:${server.port}`;
}

function call(base: string, method: string, token = TOKEN) {
  return fetch(`${base}/call`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ method, args: [] }),
  });
}

describe('remote server', () => {
  it('runs an allowed method and returns its result', async () => {
    const base = await start({ getState: () => ({ repos: [] }) });
    const response = await call(base, 'getState');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: { repos: [] } });
  });

  it('rejects a call without the pairing token', async () => {
    const handler = vi.fn();
    const base = await start({ getState: handler });
    const response = await call(base, 'getState', 'wrong-token');
    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects methods the phone may not call', async () => {
    const handler = vi.fn();
    const base = await start({ openExternal: handler });
    const response = await call(base, 'openExternal');
    expect(response.status).toBe(404);
    expect(handler).not.toHaveBeenCalled();
  });

  it('accepts a few minutes of recorded speech from the phone', async () => {
    const transcribe = vi.fn((audio: string) => `${audio.length} bytes`);
    const base = await start({ transcribe });
    const recording = 'a'.repeat(3 * 1024 * 1024);
    const response = await fetch(`${base}/call`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ method: 'transcribe', args: [recording] }),
    });
    expect(response.status).toBe(200);
    expect(transcribe).toHaveBeenCalledWith(recording);
  });

  it('accepts a photo attached on the phone', async () => {
    const saveAttachment = vi.fn(() => ({ ok: true, value: 'photo.jpg' }));
    const base = await start({ saveAttachment });
    const photo = 'a'.repeat(6 * 1024 * 1024);
    const response = await fetch(`${base}/call`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({
        method: 'saveAttachment',
        args: ['ws-1', 'photo.jpg', photo],
      }),
    });
    expect(response.status).toBe(200);
    expect(saveAttachment).toHaveBeenCalledWith('ws-1', 'photo.jpg', photo);
  });

  async function openEventStream(base: string) {
    const response = await fetch(`${base}/events`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    return response.body!.getReader();
  }

  async function nextChunk(reader: ReadableStreamDefaultReader<Uint8Array>) {
    const { value } = await reader.read();
    return new TextDecoder().decode(value);
  }

  it('pings a new event stream at once so the phone sees it open', async () => {
    const base = await start({});
    const reader = await openEventStream(base);
    expect(await nextChunk(reader)).toBe(PING);
    await reader.cancel();
  });

  it('streams remote events and leaves out the rest', async () => {
    const base = await start({});
    const reader = await openEventStream(base);
    await nextChunk(reader);
    server!.broadcast('terminal-output', { ref: 't', data: 'ls' });
    server!.broadcast('toast', { title: 'Merged', tone: 'success' });
    expect(await nextChunk(reader)).toBe(
      'event: toast\ndata: {"title":"Merged","tone":"success"}\n\n',
    );
    await reader.cancel();
  });

  it('pings open event streams so the phone can tell a dead link from a quiet one', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      const base = await start({});
      const reader = await openEventStream(base);
      await nextChunk(reader);
      vi.advanceTimersByTime(HEARTBEAT_MS);
      expect(await nextChunk(reader)).toBe(PING);
      await reader.cancel();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('connected devices', () => {
  function openEvents(base: string, device?: string) {
    return fetch(`${base}/events`, {
      headers: {
        authorization: `Bearer ${TOKEN}`,
        ...(device ? { 'x-korev-device': device } : {}),
      },
    });
  }

  it('lists a device while its event stream is open', async () => {
    const changed = vi.fn();
    const base = await start({}, changed);
    const response = await openEvents(base, 'Pixel 9');
    await vi.waitFor(() => expect(server!.devices()).toEqual(['Pixel 9']));
    await response.body!.cancel();
    await vi.waitFor(() => expect(server!.devices()).toEqual([]));
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('names an unnamed device by its address', async () => {
    const base = await start({});
    const response = await openEvents(base);
    await vi.waitFor(() => expect(server!.devices()).toEqual([LOOPBACK]));
    await response.body!.cancel();
  });
});
