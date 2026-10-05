import {
  AGENT_INFO,
  AGENT_PROVIDERS,
  type AgentAccess,
  type AgentModel,
  type AgentPreference,
  type AgentProvider,
  type AgentRunResult,
  type AgentStatus,
} from '../../shared/agents';
import {
  CommandNotFoundError,
  CommandTimeoutError,
  type CommandOptions,
  type CommandResult,
  type CommandRunner,
} from './command-runner';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { FileSystem } from '../file-system';
import { childEnv, resolveLoginPath } from './login-path';
import { extractVersion, PROVIDERS, type OutputSchema } from './providers';

const STATUS_TIMEOUT_MS = 15_000;
const SIGN_IN_TIMEOUT_MS = 5 * 60_000;
export const RUN_TIMEOUT_MS = 10 * 60_000;
const MS_PER_MINUTE = 60_000;
const SCHEMA_DIR = 'korev-schemas';
const SCHEMA_EXTENSION = '.json';
const TEST_PROMPT = 'Reply with exactly: OK';
const NO_AGENT_CHOSEN = 'Choose an AI agent in Settings first.';

export interface AgentRunRequest {
  prompt: string;
  cwd: string;
  access: AgentAccess;
  provider?: AgentProvider;
  model?: string | null;
  schema?: object;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface AgentsServiceDeps {
  run: CommandRunner;
  env: NodeJS.ProcessEnv;
  scratchDir: string;
  fs: FileSystem;
  preference(): AgentPreference;
}

export interface AgentsService {
  statuses(): Promise<AgentStatus[]>;
  signIn(provider: AgentProvider): Promise<AgentStatus[]>;
  cancelSignIn(): void;
  models(provider: AgentProvider): Promise<AgentModel[]>;
  run(request: AgentRunRequest): Promise<AgentRunResult>;
  test(provider: AgentProvider): Promise<AgentRunResult>;
  stop(): void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function lastLine(text: string): string | null {
  return text.trim().split('\n').at(-1)?.trim() || null;
}

function failureMessage(provider: AgentProvider, result: CommandResult) {
  return (
    lastLine(result.stderr) ?? `${AGENT_INFO[provider].label} gave no answer.`
  );
}

export function stoppedAfter(timeoutMs: number): string {
  const minutes = Math.round(timeoutMs / MS_PER_MINUTE);
  return `Stopped after ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

function notInstalled(provider: AgentProvider): AgentStatus {
  return {
    provider,
    installed: false,
    version: null,
    signedIn: false,
    plan: null,
    problem: null,
  };
}

export function createAgentsService(deps: AgentsServiceDeps): AgentsService {
  const lifetime = new AbortController();
  let loginPath: Promise<string> | null = null;
  let signInAttempt: AbortController | null = null;

  async function exec(
    provider: AgentProvider,
    args: string[],
    options: Omit<CommandOptions, 'env'>,
  ): Promise<CommandResult> {
    loginPath ??= resolveLoginPath(deps.run, deps.env);
    const signal = AbortSignal.any(
      [lifetime.signal, options.signal].filter((value) => value !== undefined),
    );
    return deps.run(PROVIDERS[provider].binary, args, {
      ...options,
      signal,
      env: childEnv(deps.env, await loginPath),
    });
  }

  async function status(provider: AgentProvider): Promise<AgentStatus> {
    const definition = PROVIDERS[provider];
    const timeoutMs = STATUS_TIMEOUT_MS;
    try {
      const version = await exec(provider, definition.versionArgs, {
        timeoutMs,
      });
      const signIn = await exec(provider, definition.statusArgs, { timeoutMs });
      return {
        provider,
        installed: true,
        version: extractVersion(version.stdout),
        ...definition.parseStatus(signIn),
        problem: null,
      };
    } catch (error) {
      if (error instanceof CommandNotFoundError) return notInstalled(provider);
      return {
        ...notInstalled(provider),
        installed: true,
        problem: errorMessage(error),
      };
    }
  }

  function statuses(): Promise<AgentStatus[]> {
    return Promise.all(AGENT_PROVIDERS.map(status));
  }

  async function login(provider: AgentProvider): Promise<string | null> {
    const loginArgs = PROVIDERS[provider].loginArgs;
    if (!loginArgs) return null;
    signInAttempt?.abort();
    const attempt = (signInAttempt = new AbortController());
    try {
      const result = await exec(provider, loginArgs, {
        timeoutMs: SIGN_IN_TIMEOUT_MS,
        signal: attempt.signal,
      });
      return result.exitCode === 0 ? null : failureMessage(provider, result);
    } catch (error) {
      if (error instanceof CommandTimeoutError) return 'Sign-in timed out.';
      return attempt.signal.aborted ? null : errorMessage(error);
    } finally {
      if (signInAttempt === attempt) signInAttempt = null;
    }
  }

  async function signIn(provider: AgentProvider): Promise<AgentStatus[]> {
    const problem = await login(provider);
    const refreshed = await statuses();
    return refreshed.map((entry) =>
      entry.provider === provider && !entry.signedIn && problem
        ? { ...entry, problem }
        : entry,
    );
  }

  async function models(provider: AgentProvider): Promise<AgentModel[]> {
    try {
      return await PROVIDERS[provider].listModels((args) =>
        exec(provider, args, { timeoutMs: STATUS_TIMEOUT_MS }),
      );
    } catch {
      return [];
    }
  }

  async function outputSchema(schema: object): Promise<OutputSchema> {
    const json = JSON.stringify(schema);
    const name = createHash('sha256').update(json).digest('hex');
    const path = join(
      deps.scratchDir,
      SCHEMA_DIR,
      `${name}${SCHEMA_EXTENSION}`,
    );
    await deps.fs.writeAtomic(path, json);
    return { json, path };
  }

  async function run(request: AgentRunRequest): Promise<AgentRunResult> {
    const preference = deps.preference();
    const provider = request.provider ?? preference.provider;
    if (!provider) return { ok: false, message: NO_AGENT_CHOSEN };
    const model =
      request.model === undefined
        ? (preference.models[provider] ?? null)
        : request.model;
    const definition = PROVIDERS[provider];
    const timeoutMs = request.timeoutMs ?? RUN_TIMEOUT_MS;
    try {
      const schema = request.schema ? await outputSchema(request.schema) : null;
      const result = await exec(
        provider,
        definition.runArgs({ model, access: request.access, schema }),
        {
          cwd: request.cwd,
          stdin: request.prompt,
          timeoutMs,
          signal: request.signal,
        },
      );
      return (
        definition.parseRun(result.stdout) ?? {
          ok: false,
          message: failureMessage(provider, result),
        }
      );
    } catch (error) {
      if (error instanceof CommandTimeoutError) {
        return { ok: false, message: stoppedAfter(timeoutMs) };
      }
      return { ok: false, message: errorMessage(error) };
    }
  }

  return {
    statuses,
    signIn,
    cancelSignIn: () => signInAttempt?.abort(),
    models,
    run,
    test: (provider) =>
      run({
        provider,
        prompt: TEST_PROMPT,
        cwd: deps.scratchDir,
        access: 'read-only',
      }),
    stop: () => lifetime.abort(),
  };
}
