import { timingSafeEqual } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import type { KorevApi, KorevEvents } from '../shared/api';
import { callHandler, UnknownMethodError, type IpcHandlers } from './ipc';

export const REMOTE_METHODS = [
  'getState',
  'transcript',
  'send',
  'stop',
  'respondPermission',
  'approvePlan',
  'handoffPlan',
  'newSession',
  'closeSession',
  'updateSession',
  'createWorkspaces',
  'archiveWorkspace',
  'listBranches',
  'listPullRequests',
  'listIssues',
  'slashCommands',
  'changes',
  'fileDiff',
  'rangeChanges',
  'listFiles',
  'readFile',
  'prStatuses',
  'reviewComments',
  'createPr',
  'fixChecks',
  'resolveConflicts',
  'mergePr',
  'repoIcon',
  'createAskChat',
  'deleteAskChat',
] as const satisfies readonly (keyof KorevApi)[];

const REMOTE_EVENTS: ReadonlySet<keyof KorevEvents> = new Set([
  'state',
  'chat',
  'toast',
]);

export const DEFAULT_REMOTE_PORT = 7420;
export const LOOPBACK_HOST = '127.0.0.1';
const MAX_BODY_BYTES = 1024 * 1024;
const DEVICE_HEADER = 'x-korev-device';
const MAX_DEVICE_NAME_LENGTH = 64;
const UNKNOWN_DEVICE = 'Unknown device';
const TAILNET_PREFIX_BITS = 10;
const TAILNET_NETWORK = (100 << 24) | (64 << 16);

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const HTTP_SERVER_ERROR = 500;

export interface RemoteServer {
  port: number;
  broadcast<E extends keyof KorevEvents>(
    event: E,
    payload: KorevEvents[E],
  ): void;
  devices(): string[];
  close(): Promise<void>;
}

export interface RemoteServerOptions {
  api: Partial<KorevApi>;
  token: string;
  host: string;
  port: number;
  onDevicesChange(): void;
}

class RequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function remoteHandlers(api: Partial<KorevApi>): IpcHandlers {
  return Object.fromEntries(
    REMOTE_METHODS.filter((method) => api[method]).map((method) => [
      method,
      api[method],
    ]),
  ) as IpcHandlers;
}

interface NetworkAddress {
  family: string;
  address: string;
}

function ipv4ToNumber(address: string): number {
  return address
    .split('.')
    .reduce((value, octet) => (value << 8) | Number(octet), 0);
}

function isTailnetAddress(address: string): boolean {
  const mask = -1 << (32 - TAILNET_PREFIX_BITS);
  return (ipv4ToNumber(address) & mask) === (TAILNET_NETWORK & mask);
}

export function tailnetAddress(
  interfaces: Record<string, NetworkAddress[] | undefined>,
): string | null {
  const match = Object.values(interfaces)
    .flatMap((addresses) => addresses ?? [])
    .find(
      ({ family, address }) => family === 'IPv4' && isTailnetAddress(address),
    );
  return match?.address ?? null;
}

function isAuthorized(request: IncomingMessage, token: string): boolean {
  const expected = Buffer.from(`Bearer ${token}`);
  const given = Buffer.from(request.headers.authorization ?? '');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES)
      throw new RequestError(HTTP_PAYLOAD_TOO_LARGE, 'Request too large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new RequestError(HTTP_BAD_REQUEST, 'Body is not JSON');
  }
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

function errorStatus(error: unknown): number {
  if (error instanceof RequestError) return error.status;
  if (error instanceof UnknownMethodError) return HTTP_NOT_FOUND;
  return HTTP_SERVER_ERROR;
}

async function handleCall(
  request: IncomingMessage,
  response: ServerResponse,
  handlers: IpcHandlers,
) {
  try {
    const { method, args } = (await readJson(request)) as {
      method?: unknown;
      args?: unknown;
    };
    const result = await callHandler(handlers, String(method), args);
    sendJson(response, HTTP_OK, { result: result ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendJson(response, errorStatus(error), { error: message });
  }
}

function deviceName(request: IncomingMessage): string {
  const named = request.headers[DEVICE_HEADER];
  const name = typeof named === 'string' ? named.trim() : '';
  if (name) return name.slice(0, MAX_DEVICE_NAME_LENGTH);
  return request.socket.remoteAddress ?? UNKNOWN_DEVICE;
}

function openEventStream(
  request: IncomingMessage,
  response: ServerResponse,
  subscribers: Map<ServerResponse, string>,
  onDevicesChange: () => void,
) {
  response.writeHead(HTTP_OK, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  response.flushHeaders();
  subscribers.set(response, deviceName(request));
  onDevicesChange();
  response.on('close', () => {
    subscribers.delete(response);
    onDevicesChange();
  });
}

export function startRemoteServer(
  options: RemoteServerOptions,
): Promise<RemoteServer> {
  const subscribers = new Map<ServerResponse, string>();
  const handlers = remoteHandlers(options.api);
  const server = createServer((request, response) => {
    if (!isAuthorized(request, options.token)) {
      sendJson(response, HTTP_UNAUTHORIZED, { error: 'Unauthorized' });
      return;
    }
    if (request.method === 'POST' && request.url === '/call') {
      void handleCall(request, response, handlers);
      return;
    }
    if (request.method === 'GET' && request.url === '/events') {
      openEventStream(request, response, subscribers, options.onDevicesChange);
      return;
    }
    sendJson(response, HTTP_NOT_FOUND, { error: 'Not found' });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, () => {
      resolve({
        port: (server.address() as AddressInfo).port,
        broadcast(event, payload) {
          if (!REMOTE_EVENTS.has(event)) return;
          const message = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
          for (const subscriber of subscribers.keys())
            subscriber.write(message);
        },
        devices: () => [...subscribers.values()],
        close() {
          for (const subscriber of subscribers.keys()) subscriber.end();
          server.closeAllConnections();
          return new Promise((done) => server.close(() => done()));
        },
      });
    });
  });
}
