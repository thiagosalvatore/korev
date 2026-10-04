import type { CommandRunner } from './command-runner';

const PATH_START = '__KOREV_PATH_START__';
const PATH_END = '__KOREV_PATH_END__';
const PRINT_PATH = `printf ${PATH_START}; /usr/bin/printenv PATH; printf ${PATH_END}`;
const SHELL_TIMEOUT_MS = 5000;
const DEFAULT_SHELL = '/bin/zsh';
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

async function shellPath(
  run: CommandRunner,
  env: NodeJS.ProcessEnv,
): Promise<string | null> {
  try {
    const { stdout } = await run(
      env.SHELL || DEFAULT_SHELL,
      ['-ilc', PRINT_PATH],
      { env, timeoutMs: SHELL_TIMEOUT_MS },
    );
    return between(stdout, PATH_START, PATH_END);
  } catch {
    return null;
  }
}

function installDirs(home: string | undefined): string[] {
  const homeDirs = home ? HOME_DIRS.map((dir) => `${home}/${dir}`) : [];
  return [...homeDirs, ...SYSTEM_DIRS];
}

export async function resolveLoginPath(
  run: CommandRunner,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  const dirs = [
    await shellPath(run, env),
    env.PATH,
    ...installDirs(env.HOME),
  ].flatMap((value) => value?.split(PATH_SEPARATOR) ?? []);
  return [...new Set(dirs.filter(Boolean))].join(PATH_SEPARATOR);
}

export function childEnv(
  env: NodeJS.ProcessEnv,
  path: string,
): NodeJS.ProcessEnv {
  const inherited = Object.entries(env).filter(
    ([name]) =>
      !name.startsWith(ELECTRON_VARIABLE_PREFIX) &&
      !GITHUB_TOKEN_VARIABLES.has(name),
  );
  return { ...Object.fromEntries(inherited), PATH: path };
}
