import type { TerminalSize } from '../shared/model';
import { DEFAULT_SHELL } from './login-path';

const SCROLLBACK_CHARS = 256 * 1024;
const LOGIN_SHELL_ARGS = ['-l'];
const COMMAND_FLAG = '-lc';
const TERMINAL_TYPE = 'xterm-256color';
const INPUT_AFTER_QUIET_MS = 500;
const READY_OUTPUT_WINDOW_CHARS = 4096;

export interface Pty {
  onData(listener: (data: string) => void): unknown;
  onExit(listener: (event: { exitCode: number }) => void): unknown;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
}

export interface PtyOptions extends TerminalSize {
  name: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export type SpawnPty = (
  file: string,
  args: string[],
  options: PtyOptions,
) => Pty;

export interface TerminalsDeps {
  spawnPty: SpawnPty;
  shell: string | undefined;
  onOutput(ref: string, data: string): void;
  onExit(ref: string, exitCode: number): void;
}

export interface TerminalLaunch {
  cwd: string;
  env: NodeJS.ProcessEnv;
  command?: string;
  input?: string;
  typeInputAfter?: RegExp;
}

const DEFAULT_SIZE: TerminalSize = { cols: 120, rows: 30 };

export interface Terminals {
  attach(ref: string, size: TerminalSize): string | null;
  output(ref: string): string | null;
  start(ref: string, launch: TerminalLaunch, size?: TerminalSize): void;
  isRunning(ref: string): boolean;
  running(): string[];
  write(ref: string, data: string): void;
  resize(ref: string, size: TerminalSize): void;
  close(ref: string): void;
  closeMatching(prefix: string): void;
  closeAll(): void;
}

interface Session {
  pty: Pty;
  scrollback: string;
}

function typeWhenQuiet(
  type: () => void,
  readyOutput: RegExp | undefined,
): (data: string) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let output = '';
  let ready = !readyOutput;
  let typed = false;
  return (data) => {
    if (typed) return;
    if (!ready) {
      output = (output + data).slice(-READY_OUTPUT_WINDOW_CHARS);
      ready = Boolean(readyOutput?.test(output));
    }
    if (!ready) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      typed = true;
      type();
    }, INPUT_AFTER_QUIET_MS);
  };
}

export function createTerminals(deps: TerminalsDeps): Terminals {
  const sessions = new Map<string, Session>();
  const finished = new Map<string, string>();

  function start(
    ref: string,
    launch: TerminalLaunch,
    size: TerminalSize = DEFAULT_SIZE,
  ) {
    close(ref);
    const args = launch.command
      ? [COMMAND_FLAG, launch.command]
      : LOGIN_SHELL_ARGS;
    const pty = deps.spawnPty(deps.shell || DEFAULT_SHELL, args, {
      name: TERMINAL_TYPE,
      cwd: launch.cwd,
      env: { ...launch.env, TERM: TERMINAL_TYPE, COLORTERM: 'truecolor' },
      ...size,
    });
    const session: Session = { pty, scrollback: '' };
    const { input } = launch;
    const typeInputWhenQuiet = input
      ? typeWhenQuiet(() => {
          if (sessions.get(ref) === session) pty.write(input);
        }, launch.typeInputAfter)
      : null;
    pty.onData((data) => {
      session.scrollback = (session.scrollback + data).slice(-SCROLLBACK_CHARS);
      deps.onOutput(ref, data);
      typeInputWhenQuiet?.(data);
    });
    pty.onExit(({ exitCode }) => {
      if (sessions.get(ref) !== session) return;
      sessions.delete(ref);
      finished.set(ref, session.scrollback);
      deps.onExit(ref, exitCode);
    });
    sessions.set(ref, session);
    finished.delete(ref);
  }

  function output(ref: string): string | null {
    return sessions.get(ref)?.scrollback ?? finished.get(ref) ?? null;
  }

  function attach(ref: string, size: TerminalSize): string | null {
    sessions.get(ref)?.pty.resize(size.cols, size.rows);
    return output(ref);
  }

  function close(ref: string): void {
    const session = sessions.get(ref);
    if (!session) return;
    sessions.delete(ref);
    finished.set(ref, session.scrollback);
    session.pty.kill();
    deps.onExit(ref, -1);
  }

  return {
    attach,
    output,
    start,
    isRunning: (ref) => sessions.has(ref),
    running: () => [...sessions.keys()],
    write: (ref, data) => sessions.get(ref)?.pty.write(data),
    resize: (ref, size) => sessions.get(ref)?.pty.resize(size.cols, size.rows),
    close,
    closeMatching: (prefix) =>
      [...sessions.keys()]
        .filter((ref) => ref.startsWith(prefix))
        .forEach(close),
    closeAll: () => [...sessions.keys()].forEach(close),
  };
}
