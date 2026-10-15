import { randomBytes } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { errorMessage } from './context';
import { LOOPBACK_HOST, readBody } from './remote-server';

const CLI_PATH_PREFIX = '/cli/';
const ARGUMENT_FIELD = 'a';
const TOKEN_BYTES = 24;
const ANY_FREE_PORT = 0;
const CLI_SCRIPT = 'korev';
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const UNKNOWN_AGENT =
  'This korev command came from an agent turn that has ended. Run it again from a new turn.';

export interface CliCall {
  sessionId: string;
  argv: string[];
}

export interface CliReply {
  ok: boolean;
  output: string;
}

export type CliHandler = (call: CliCall) => Promise<CliReply>;

export interface AgentGrant {
  env: Record<string, string>;
  revoke(): void;
}

export interface AgentAccess {
  grant(sessionId: string, basePath: string | undefined): AgentGrant;
}

export interface AgentServer extends AgentAccess {
  close(): Promise<void>;
}

function reply(response: ServerResponse, status: number, text: string) {
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  response.end(text.endsWith('\n') ? text : `${text}\n`);
}

function tokenOf(request: IncomingMessage): string {
  const url = request.url ?? '';
  return url.startsWith(CLI_PATH_PREFIX)
    ? url.slice(CLI_PATH_PREFIX.length)
    : '';
}

async function answer(
  request: IncomingMessage,
  response: ServerResponse,
  sessionId: string,
  handle: CliHandler,
) {
  try {
    const argv = new URLSearchParams(await readBody(request)).getAll(
      ARGUMENT_FIELD,
    );
    const result = await handle({ sessionId, argv });
    reply(response, result.ok ? HTTP_OK : HTTP_BAD_REQUEST, result.output);
  } catch (error) {
    reply(response, HTTP_BAD_REQUEST, errorMessage(error));
  }
}

export function startAgentServer(
  cliDir: string,
  handle: CliHandler,
): Promise<AgentServer> {
  const sessions = new Map<string, string>();
  const server = createServer((request, response) => {
    const sessionId = sessions.get(tokenOf(request));
    if (!sessionId) {
      reply(response, HTTP_UNAUTHORIZED, UNKNOWN_AGENT);
      return;
    }
    void answer(request, response, sessionId, handle);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(ANY_FREE_PORT, LOOPBACK_HOST, () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        grant(sessionId, basePath) {
          const token = randomBytes(TOKEN_BYTES).toString('base64url');
          sessions.set(token, sessionId);
          return {
            env: {
              KOREV_AGENT_URL: `http://${LOOPBACK_HOST}:${port}${CLI_PATH_PREFIX}${token}`,
              KOREV_CLI: path.join(cliDir, CLI_SCRIPT),
              PATH: basePath ? `${cliDir}:${basePath}` : cliDir,
            },
            revoke: () => sessions.delete(token),
          };
        },
        close() {
          server.closeAllConnections();
          return new Promise((done) => server.close(() => done()));
        },
      });
    });
  });
}
