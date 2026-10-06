import { join } from 'node:path';
import type { FileSystem } from '../file-system';

const SKILL_PLUGINS_DIR = 'claude-skills';
const USER_SKILLS_PLUGIN = 'user-skills';
const SKILLS_DIR = 'skills';
const CLAUDE_DIR = '.claude';
const INSTALLED_PLUGINS_PATH = ['plugins', 'installed_plugins.json'];
const SETTINGS_FILE = 'settings.json';
const USER_SCOPE = 'user';
const MARKETPLACE_SEPARATOR = '@';

interface PluginInstall {
  scope: string;
  installPath: string;
}

interface InstalledPlugins {
  plugins?: Record<string, PluginInstall[]>;
}

interface ClaudeSettings {
  enabledPlugins?: Record<string, boolean>;
}

interface SkillSource {
  name: string;
  skillsPath: string;
}

export interface SkillPluginDeps {
  fs: FileSystem;
  home: string;
  scratchDir: string;
}

async function readJson<T>(fs: FileSystem, path: string): Promise<T | null> {
  const contents = await fs.read(path);
  if (!contents) return null;
  try {
    return JSON.parse(contents.toString()) as T;
  } catch {
    return null;
  }
}

function pluginName(key: string): string {
  return key.split(MARKETPLACE_SEPARATOR)[0];
}

async function enabledPluginSkills(
  fs: FileSystem,
  claudeDir: string,
): Promise<SkillSource[]> {
  const installed = await readJson<InstalledPlugins>(
    fs,
    join(claudeDir, ...INSTALLED_PLUGINS_PATH),
  );
  const settings = await readJson<ClaudeSettings>(
    fs,
    join(claudeDir, SETTINGS_FILE),
  );
  const enabled = settings?.enabledPlugins ?? {};
  return Object.entries(installed?.plugins ?? {}).flatMap(([key, installs]) => {
    const userInstall = installs.find(({ scope }) => scope === USER_SCOPE);
    if (enabled[key] !== true || !userInstall) return [];
    return [
      {
        name: pluginName(key),
        skillsPath: join(userInstall.installPath, SKILLS_DIR),
      },
    ];
  });
}

export async function linkSkillPlugins({
  fs,
  home,
  scratchDir,
}: SkillPluginDeps): Promise<string[]> {
  const claudeDir = join(home, CLAUDE_DIR);
  const sources: SkillSource[] = [
    { name: USER_SKILLS_PLUGIN, skillsPath: join(claudeDir, SKILLS_DIR) },
    ...(await enabledPluginSkills(fs, claudeDir)),
  ];
  return Promise.all(
    sources.map(async ({ name, skillsPath }) => {
      const pluginDir = join(scratchDir, SKILL_PLUGINS_DIR, name);
      await fs.link(skillsPath, join(pluginDir, SKILLS_DIR));
      return pluginDir;
    }),
  );
}
