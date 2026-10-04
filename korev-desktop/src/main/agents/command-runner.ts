import { spawn } from 'node:child_process';

const MISSING_COMMAND_CODE = 'ENOENT';
const MAX_OUTPUT_CHARS = 5_000_000;

export interface CommandOptions {
  timeoutMs: number;
  cwd?: string;
  stdin?: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}

export interface CommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export type CommandRunner = (
  file: string,
  args: readonly string[],
  options: CommandOptions,
) => Promise<CommandResult>;

export class CommandNotFoundError extends Error {
  constructor(file: string) {
    super(`${file} is not installed`);
    this.name = 'CommandNotFoundError';
  }
}

export class CommandTimeoutError extends Error {
  constructor(file: string) {
    super(`${file} did not finish in time`);
    this.name = 'CommandTimeoutError';
  }
}

export class CommandAbortedError extends Error {
  constructor(file: string) {
    super(`${file} was stopped`);
    this.name = 'CommandAbortedError';
  }
}

function ignoreClosedStdin() {}

function outputCollector() {
  let text = '';
  return {
    append(chunk: Buffer) {
      if (text.length < MAX_OUTPUT_CHARS) text += chunk.toString('utf8');
    },
    text: () => text.slice(0, MAX_OUTPUT_CHARS),
  };
}

function spawnError(file: string, error: NodeJS.ErrnoException): Error {
  return error.code === MISSING_COMMAND_CODE
    ? new CommandNotFoundError(file)
    : error;
}

export const runProcess: CommandRunner = (file, args, options) =>
  new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new CommandAbortedError(file));
      return;
    }
    const child = spawn(file, args, { cwd: options.cwd, env: options.env });
    const stdout = outputCollector();
    const stderr = outputCollector();
    let stopReason: Error | null = null;

    function stop(reason: Error) {
      stopReason = reason;
      child.kill();
    }
    const onAbort = () => stop(new CommandAbortedError(file));
    const timer = setTimeout(
      () => stop(new CommandTimeoutError(file)),
      options.timeoutMs,
    );
    options.signal?.addEventListener('abort', onAbort, { once: true });

    function settle() {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
    }

    child.stdout.on('data', stdout.append);
    child.stderr.on('data', stderr.append);
    child.stdin.on('error', ignoreClosedStdin);
    child.on('error', (error) => {
      settle();
      reject(spawnError(file, error));
    });
    child.on('close', (exitCode) => {
      settle();
      if (stopReason) reject(stopReason);
      else resolve({ exitCode, stdout: stdout.text(), stderr: stderr.text() });
    });
    child.stdin.end(options.stdin ?? '');
  });
