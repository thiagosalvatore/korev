import type { TerminalSize } from '../shared/terminal';
import { DEFAULT_SHELL, isElectronVariable } from './agents/login-path';

const SCROLLBACK_CHARS = 256 * 1024;
const LOGIN_SHELL_ARGS = ['-l'];
const TERMINAL_TYPE = 'xterm-256color';

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
  env: NodeJS.ProcessEnv;
  onOutput(ref: string, data: string): void;
  onExit(ref: string): void;
}

export interface Terminals {
  open(ref: string, cwd: string, size: TerminalSize): string;
  write(ref: string, data: string): void;
  resize(ref: string, size: TerminalSize): void;
  close(ref: string): void;
  closeAll(): void;
}

interface Session {
  pty: Pty;
  scrollback: string;
}

function shellEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const inherited = Object.entries(env).filter(
    ([name]) => !isElectronVariable(name),
  );
  return {
    ...Object.fromEntries(inherited),
    TERM: TERMINAL_TYPE,
    COLORTERM: 'truecolor',
  };
}

export function createTerminals(deps: TerminalsDeps): Terminals {
  const sessions = new Map<string, Session>();

  function start(ref: string, cwd: string, size: TerminalSize): Session {
    const pty = deps.spawnPty(
      deps.env.SHELL || DEFAULT_SHELL,
      LOGIN_SHELL_ARGS,
      {
        name: TERMINAL_TYPE,
        cwd,
        env: shellEnv(deps.env),
        ...size,
      },
    );
    const session: Session = { pty, scrollback: '' };
    pty.onData((data) => {
      session.scrollback = (session.scrollback + data).slice(-SCROLLBACK_CHARS);
      deps.onOutput(ref, data);
    });
    pty.onExit(() => {
      if (sessions.get(ref) !== session) return;
      sessions.delete(ref);
      deps.onExit(ref);
    });
    sessions.set(ref, session);
    return session;
  }

  function open(ref: string, cwd: string, size: TerminalSize): string {
    const running = sessions.get(ref);
    if (!running) return start(ref, cwd, size).scrollback;
    running.pty.resize(size.cols, size.rows);
    return running.scrollback;
  }

  function close(ref: string): void {
    const session = sessions.get(ref);
    if (!session) return;
    sessions.delete(ref);
    session.pty.kill();
    deps.onExit(ref);
  }

  return {
    open,
    write: (ref, data) => sessions.get(ref)?.pty.write(data),
    resize: (ref, size) => sessions.get(ref)?.pty.resize(size.cols, size.rows),
    close,
    closeAll: () => [...sessions.keys()].forEach(close),
  };
}
