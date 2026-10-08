import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import {
  createRemoteAccess,
  type RemoteAccess,
  type Tailnet,
} from './remote-access';

const LOOPBACK = '127.0.0.1';
const ANY_FREE_PORT = 0;
const ON = { remoteAccess: true, remotePort: ANY_FREE_PORT };
const OFF = { remoteAccess: false, remotePort: ANY_FREE_PORT };
const LOGIN_URL = 'https://login.tailscale.com/a/abc';

interface FakeTailnet extends Tailnet {
  signIn(ip: string): void;
}

function fakeTailnet(onChange: () => void): FakeTailnet {
  let ip: string | null = null;
  return {
    ip: () => ip,
    loginUrl: () => (ip ? null : LOGIN_URL),
    error: () => null,
    close: () => {},
    signIn(address) {
      ip = address;
      onChange();
    },
  };
}

let dir: string;
let remote: RemoteAccess;
let onChange: Mock<() => void>;
let tailnet: FakeTailnet | null;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'korev-remote-'));
  onChange = vi.fn();
  remote = createRemoteAccess({
    tokenPath: path.join(dir, 'remote-token'),
    api: () => ({ getState: async () => ({}) as never }),
    startTailnet: (_port, changed) => (tailnet = fakeTailnet(changed)),
    onChange,
  });
});

async function applySignedIn() {
  await remote.apply(ON);
  tailnet!.signIn(LOOPBACK);
}

afterEach(async () => {
  await remote.close();
  await rm(dir, { recursive: true, force: true });
});

function getState(url: string, token: string) {
  return fetch(`${url}/call`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ method: 'getState', args: [] }),
  });
}

describe('remote access', () => {
  it('starts and stops with the setting', async () => {
    await applySignedIn();
    const pairing = await remote.pairing();
    expect(pairing?.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect((await getState(pairing!.url, pairing!.token)).status).toBe(200);
    expect(remote.status().address).toBe(pairing!.url.slice('http://'.length));

    await remote.apply(OFF);
    expect(remote.status().address).toBeNull();
    expect(await remote.pairing()).toBeNull();
    expect(onChange).toHaveBeenCalled();
  });

  it('pairs only after the tailnet is signed in', async () => {
    await remote.apply(ON);
    expect(remote.status()).toMatchObject({
      address: null,
      loginUrl: LOGIN_URL,
    });
    expect(await remote.pairing()).toBeNull();

    tailnet!.signIn('100.1.2.3');
    const port = remote.status().address!.split(':')[1];
    expect((await remote.pairing())?.url).toBe(`http://100.1.2.3:${port}`);
    expect(remote.status().loginUrl).toBeNull();
  });

  it('rejects the old token after revoking devices', async () => {
    await applySignedIn();
    const before = (await remote.pairing())!;
    await remote.revoke();
    tailnet!.signIn(LOOPBACK);
    const after = (await remote.pairing())!;
    expect(after.token).not.toBe(before.token);
    expect((await getState(after.url, before.token)).status).toBe(401);
    expect((await getState(after.url, after.token)).status).toBe(200);
  });

  it('reports why the server did not start', async () => {
    const taken: Server = createServer();
    await new Promise<void>((done) => taken.listen(0, LOOPBACK, done));
    const port = (taken.address() as { port: number }).port;
    await remote.apply({ remoteAccess: true, remotePort: port });
    expect(remote.status()).toMatchObject({ address: null });
    expect(remote.status().error).toContain('EADDRINUSE');
    await new Promise((done) => taken.close(done));
  });
});
