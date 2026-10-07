import { access, readdir } from 'node:fs/promises';
import path from 'node:path';
import { AGENT_KINDS, type AgentKind, type Skill } from '../shared/model';

const SKILL_FILE = 'SKILL.md';

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
