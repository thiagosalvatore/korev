import { copyFile, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  EMPTY_SCRIPTS,
  type Repo,
  type RepoScripts,
  type Workspace,
} from '../shared/model';

const CITIES = [
  'abuja',
  'accra',
  'adelaide',
  'algiers',
  'amman',
  'amsterdam',
  'ankara',
  'antwerp',
  'apia',
  'asmara',
  'astana',
  'asuncion',
  'athens',
  'auckland',
  'baku',
  'bamako',
  'bangkok',
  'banjul',
  'barcelona',
  'basseterre',
  'beirut',
  'belgrade',
  'belmopan',
  'bergen',
  'berlin',
  'bern',
  'bilbao',
  'bishkek',
  'bogota',
  'bordeaux',
  'boston',
  'brasilia',
  'bratislava',
  'brisbane',
  'bristol',
  'brno',
  'bruges',
  'brussels',
  'bucharest',
  'budapest',
  'cairo',
  'calgary',
  'canberra',
  'caracas',
  'cardiff',
  'castries',
  'chennai',
  'chicago',
  'colombo',
  'copenhagen',
  'cordoba',
  'cork',
  'cusco',
  'dakar',
  'dhaka',
  'dili',
  'doha',
  'dublin',
  'durban',
  'edinburgh',
  'florence',
  'freetown',
  'funchal',
  'gaborone',
  'galway',
  'geneva',
  'genoa',
  'ghent',
  'granada',
  'hanoi',
  'harare',
  'havana',
  'helsinki',
  'hobart',
  'honiara',
  'houston',
  'istanbul',
  'jakarta',
  'kampala',
  'kathmandu',
  'kigali',
  'kingston',
  'kinshasa',
  'kraków',
  'kyoto',
  'lagos',
  'lahore',
  'lima',
  'lisbon',
  'ljubljana',
  'lome',
  'london',
  'luanda',
  'lusaka',
  'lyon',
  'madrid',
  'majuro',
  'malabo',
  'male',
  'managua',
  'manama',
  'manila',
  'maputo',
  'marseille',
  'maseru',
  'medellin',
  'melbourne',
  'milan',
  'minsk',
  'mombasa',
  'monaco',
  'montevideo',
  'montreal',
  'moroni',
  'mumbai',
  'munich',
  'muscat',
  'nairobi',
  'nantes',
  'naples',
  'nassau',
  'niamey',
  'nicosia',
  'osaka',
  'oslo',
  'ottawa',
  'palermo',
  'panama',
  'paramaribo',
  'paris',
  'perth',
  'porto',
  'prague',
  'praia',
  'pretoria',
  'quito',
  'rabat',
  'recife',
  'reykjavik',
  'riga',
  'riyadh',
  'rome',
  'roseau',
  'rotterdam',
  'salvador',
  'santiago',
  'sapporo',
  'sarajevo',
  'seoul',
  'seville',
  'singapore',
  'skopje',
  'sofia',
  'stockholm',
  'suva',
  'sydney',
  'taipei',
  'tallinn',
  'tashkent',
  'tbilisi',
  'thimphu',
  'tirana',
  'tokyo',
  'toronto',
  'tripoli',
  'tunis',
  'turin',
  'utrecht',
  'valencia',
  'valletta',
  'vancouver',
  'venice',
  'victoria',
  'vienna',
  'vilnius',
  'warsaw',
  'wellington',
  'windhoek',
  'yerevan',
  'zagreb',
  'zurich',
].map((city) => city.normalize('NFKD').replace(/[̀-ͯ]/g, ''));

export const FIRST_PORT = 55_000;
export const PORTS_PER_WORKSPACE = 10;
const PROJECT_CONFIG_FILE = 'conductor.json';

export function pickWorkspaceName(
  taken: ReadonlySet<string>,
  random: () => number = Math.random,
): string {
  const free = CITIES.filter((city) => !taken.has(city));
  if (free.length) return free[Math.floor(random() * free.length)];
  const base = CITIES[Math.floor(random() * CITIES.length)];
  let version = 2;
  while (taken.has(`${base}-v${version}`)) version += 1;
  return `${base}-v${version}`;
}

export function allocatePort(used: readonly number[]): number {
  let port = FIRST_PORT;
  while (used.includes(port)) port += PORTS_PER_WORKSPACE;
  return port;
}

export function workspaceEnv(
  repo: Repo,
  workspace: Workspace,
): Record<string, string> {
  return {
    CONDUCTOR_WORKSPACE_NAME: workspace.name,
    CONDUCTOR_WORKSPACE_PATH: workspace.path,
    CONDUCTOR_ROOT_PATH: repo.path,
    CONDUCTOR_DEFAULT_BRANCH: workspace.baseBranch,
    CONDUCTOR_PORT: String(workspace.port),
    CONDUCTOR_IS_LOCAL: '1',
    CONDUCTOR_WORKSPACE_ID: workspace.id,
  };
}

interface ProjectConfig {
  scripts?: { setup?: unknown; run?: unknown; archive?: unknown };
  runScriptMode?: unknown;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function parseProjectConfig(json: string): Partial<RepoScripts> {
  let config: ProjectConfig;
  try {
    config = JSON.parse(json) as ProjectConfig;
  } catch {
    return {};
  }
  const scripts = config.scripts ?? {};
  const picked: Partial<RepoScripts> = {
    setup: text(scripts.setup),
    run: text(scripts.run),
    archive: text(scripts.archive),
    runMode:
      config.runScriptMode === 'nonconcurrent' ? 'nonconcurrent' : undefined,
  };
  return Object.fromEntries(
    Object.entries(picked).filter(([, value]) => value !== undefined),
  );
}

export async function effectiveScripts(
  repo: Repo,
  workspacePath: string,
): Promise<RepoScripts> {
  const json = await readFile(
    path.join(workspacePath, PROJECT_CONFIG_FILE),
    'utf8',
  ).catch(() => null);
  const fromProject = json ? parseProjectConfig(json) : {};
  return { ...EMPTY_SCRIPTS, ...repo.scripts, ...fromProject };
}

const COPIED_FILE_PATTERN = /^\.env/;

export async function copyLocalFiles(
  repoPath: string,
  workspacePath: string,
  isIgnored: (file: string) => Promise<boolean>,
): Promise<string[]> {
  const entries = await readdir(repoPath, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isFile() && COPIED_FILE_PATTERN.test(entry.name))
    .map((entry) => entry.name);
  const copied: string[] = [];
  for (const file of candidates) {
    if (!(await isIgnored(file))) continue;
    await copyFile(path.join(repoPath, file), path.join(workspacePath, file));
    copied.push(file);
  }
  return copied;
}
