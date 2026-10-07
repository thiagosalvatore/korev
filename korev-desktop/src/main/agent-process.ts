import { spawn } from 'node:child_process';
import { CommandNotFoundError } from './command-runner';

const MISSING_COMMAND_CODE = 'ENOENT';
const STDERR_MAX_CHARS = 20_000;
const NEWLINE = '\n';

export interface AgentProcessOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  onLine(line: string): void;
}

export interface AgentExit {
  exitCode: number | null;
  stderr: string;
  stopped: boolean;
}

export interface AgentProcess {
  write(line: string): void;
  closeInput(): void;
  inputOpen(): boolean;
  stop(): void;
  done: Promise<AgentExit>;
}

function ignoreClosedStdin() {}

export function spawnAgent(
  binary: string,
  args: readonly string[],
  options: AgentProcessOptions,
): AgentProcess {
  const child = spawn(binary, args, { cwd: options.cwd, env: options.env });
  let stderr = '';
  let partial = '';
  let stopped = false;
  let inputOpen = true;

  child.stdout.on('data', (chunk: Buffer) => {
    const lines = (partial + chunk.toString('utf8')).split(NEWLINE);
    partial = lines.pop() ?? '';
    lines.forEach(options.onLine);
  });
  child.stderr.on('data', (chunk: Buffer) => {
    if (stderr.length < STDERR_MAX_CHARS) stderr += chunk.toString('utf8');
  });
  child.stdin.on('error', ignoreClosedStdin);

  const done = new Promise<AgentExit>((resolve, reject) => {
    child.on('error', (error: NodeJS.ErrnoException) => {
      reject(
        error.code === MISSING_COMMAND_CODE
          ? new CommandNotFoundError(binary)
          : error,
      );
    });
    child.on('close', (exitCode) => {
      if (partial) options.onLine(partial);
      resolve({ exitCode, stderr, stopped });
    });
  });

  return {
    write(line) {
      if (inputOpen) child.stdin.write(`${line}${NEWLINE}`);
    },
    closeInput() {
      if (!inputOpen) return;
      inputOpen = false;
      child.stdin.end();
    },
    inputOpen: () => inputOpen,
    stop() {
      stopped = true;
      child.kill();
    },
    done,
  };
}
