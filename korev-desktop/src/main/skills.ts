import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { AGENT_KINDS, type AgentKind, type Skill } from '../shared/model';

const SKILL_FILE = 'SKILL.md';
const COMMAND_EXTENSION = '.md';

const SKILL_DIRS: Record<AgentKind, string[]> = {
  claude: ['.claude/skills'],
  codex: ['.agents/skills', '.codex/skills'],
};

async function isSkill(dir: string, name: string): Promise<boolean> {
  return access(path.join(dir, name, SKILL_FILE)).then(
    () => true,
    () => false,
  );
}

async function skillNames(dir: string): Promise<string[]> {
  const entries = await readdir(dir).catch(() => []);
  const found = await Promise.all(
    entries.map(async (entry) => ((await isSkill(dir, entry)) ? entry : null)),
  );
  return found.filter((name) => name !== null);
}

async function agentSkills(
  agent: AgentKind,
  roots: string[],
): Promise<string[]> {
  const dirs = roots.flatMap((root) =>
    SKILL_DIRS[agent].map((dir) => path.join(root, dir)),
  );
  return (await Promise.all(dirs.map(skillNames))).flat();
}

export async function listSkills(
  home: string,
  repoPath: string,
): Promise<Skill[]> {
  const agentsByName = new Map<string, Set<AgentKind>>();
  for (const agent of AGENT_KINDS) {
    for (const name of await agentSkills(agent, [repoPath, home])) {
      const agents = agentsByName.get(name) ?? new Set<AgentKind>();
      agentsByName.set(name, agents.add(agent));
    }
  }
  return [...agentsByName.keys()].sort().map((name) => ({
    name,
    agents: AGENT_KINDS.filter((agent) => agentsByName.get(name)?.has(agent)),
  }));
}

export async function commandNames(dir: string): Promise<string[]> {
  const entries = await readdir(dir).catch(() => []);
  return entries
    .filter((entry) => entry.endsWith(COMMAND_EXTENSION))
    .map((entry) => entry.slice(0, -COMMAND_EXTENSION.length));
}

interface PluginInstall {
  scope?: string;
  projectPath?: string;
  installPath?: string;
}

async function readJson(file: string): Promise<unknown> {
  return readFile(file, 'utf8')
    .then(JSON.parse)
    .catch(() => null);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

// Claude Code runs a plugin's skills and commands as `/plugin:name`.
export async function pluginCommands(
  home: string,
  repoPath: string,
): Promise<string[]> {
  const claude = path.join(home, '.claude');
  const installed = record(
    record(
      await readJson(path.join(claude, 'plugins', 'installed_plugins.json')),
    ).plugins,
  );
  const enabled = record(
    record(await readJson(path.join(claude, 'settings.json'))).enabledPlugins,
  );
  const found = await Promise.all(
    Object.entries(installed).flatMap(([id, installs]) => {
      if (enabled[id] === false || !Array.isArray(installs)) return [];
      const plugin = id.split('@')[0];
      return (installs as PluginInstall[])
        .filter(
          (install) =>
            typeof install?.installPath === 'string' &&
            (install.scope !== 'project' || install.projectPath === repoPath),
        )
        .map(async ({ installPath = '' }) => {
          const names = await Promise.all([
            skillNames(path.join(installPath, 'skills')),
            commandNames(path.join(installPath, 'commands')),
          ]);
          return names.flat().map((name) => `${plugin}:${name}`);
        });
    }),
  );
  return [...new Set(found.flat())];
}
