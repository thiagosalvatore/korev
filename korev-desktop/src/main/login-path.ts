import type { CommandRunner } from './command-runner';

const PATH_VARIABLE = 'PATH';
const LOGIN_VARIABLES = [
  'SSH_AUTH_SOCK',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'NODE_EXTRA_CA_CERTS',
  'REQUESTS_CA_BUNDLE',
  'GIT_SSL_CAINFO',
];
const startMarker = (name: string) => `__KOREV_${name}_START__`;
const endMarker = (name: string) => `__KOREV_${name}_END__`;
const PRINT_LOGIN_ENV = [PATH_VARIABLE, ...LOGIN_VARIABLES]
  .map(
    (name) =>
      `printf ${startMarker(name)}; /usr/bin/printenv ${name}; printf ${endMarker(name)}`,
  )
  .join('; ');
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

function printedValue(output: string, name: string): string | null {
  return between(output, startMarker(name), endMarker(name));
}

export interface LoginEnv {
  path: string;
  variables: Record<string, string>;
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
  const printed = LOGIN_VARIABLES.flatMap((name) => {
    const value = printedValue(output, name);
    return value ? [[name, value] as const] : [];
  });
  return {
    path: mergedPath(printedValue(output, PATH_VARIABLE), env),
    variables: Object.fromEntries(printed),
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
  return {
    ...Object.fromEntries(inherited),
    ...login.variables,
    PATH: login.path,
  };
}
