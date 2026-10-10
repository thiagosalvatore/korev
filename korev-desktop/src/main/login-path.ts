import type { CommandRunner } from './command-runner';

const PATH_START = '__KOREV_PATH_START__';
const PATH_END = '__KOREV_PATH_END__';
const SSH_AUTH_SOCK_START = '__KOREV_SSH_AUTH_SOCK_START__';
const SSH_AUTH_SOCK_END = '__KOREV_SSH_AUTH_SOCK_END__';
const PRINT_LOGIN_ENV = [
  `printf ${PATH_START}; /usr/bin/printenv PATH; printf ${PATH_END}`,
  `printf ${SSH_AUTH_SOCK_START}; /usr/bin/printenv SSH_AUTH_SOCK; printf ${SSH_AUTH_SOCK_END}`,
].join('; ');
const SHELL_TIMEOUT_MS = 5000;
export const DEFAULT_SHELL = '/bin/zsh';
const PATH_SEPARATOR = ':';
const SYSTEM_DIRS = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'];
const HOME_DIRS = ['.local/bin', '.npm-global/bin', '.bun/bin'];
const ELECTRON_VARIABLE_PREFIX = 'ELECTRON_';
const GITHUB_TOKEN_VARIABLES = new Set([
  'GH_TOKEN',
  'GITHUB_TOKEN',
  'GH_ENTERPRISE_TOKEN',
  'GITHUB_ENTERPRISE_TOKEN',
]);

function between(text: string, start: string, end: string): string | null {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from);
  if (from === -1 || to === -1) return null;
  return text.slice(from + start.length, to).trim();
}

export interface LoginEnv {
  path: string;
  sshAuthSock?: string;
}

async function shellOutput(
  run: CommandRunner,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  try {
    const { stdout } = await run(
      env.SHELL || DEFAULT_SHELL,
      ['-ilc', PRINT_LOGIN_ENV],
      { env, timeoutMs: SHELL_TIMEOUT_MS },
    );
    return stdout;
  } catch {
    return '';
  }
}

function installDirs(home: string | undefined): string[] {
  const homeDirs = home ? HOME_DIRS.map((dir) => `${home}/${dir}`) : [];
  return [...homeDirs, ...SYSTEM_DIRS];
}

function mergedPath(shellPath: string | null, env: NodeJS.ProcessEnv): string {
  const dirs = [shellPath, env.PATH, ...installDirs(env.HOME)].flatMap(
    (value) => value?.split(PATH_SEPARATOR) ?? [],
  );
  return [...new Set(dirs.filter(Boolean))].join(PATH_SEPARATOR);
}

export async function resolveLoginEnv(
  run: CommandRunner,
  env: NodeJS.ProcessEnv,
): Promise<LoginEnv> {
  const output = await shellOutput(run, env);
  return {
    path: mergedPath(between(output, PATH_START, PATH_END), env),
    sshAuthSock:
      between(output, SSH_AUTH_SOCK_START, SSH_AUTH_SOCK_END) || undefined,
  };
}

export function isElectronVariable(name: string): boolean {
  return name.startsWith(ELECTRON_VARIABLE_PREFIX);
}

export function childEnv(
  env: NodeJS.ProcessEnv,
  login: LoginEnv,
): NodeJS.ProcessEnv {
  const inherited = Object.entries(env).filter(
    ([name]) => !isElectronVariable(name) && !GITHUB_TOKEN_VARIABLES.has(name),
  );
  const sshAuthSock = login.sshAuthSock
    ? { SSH_AUTH_SOCK: login.sshAuthSock }
    : {};
  return { ...Object.fromEntries(inherited), PATH: login.path, ...sshAuthSock };
}
