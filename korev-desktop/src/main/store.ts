import path from 'node:path';
import {
  AGENT_KINDS,
  CLAUDE_MODELS,
  CODEX_DEFAULT_MODEL,
  DEFAULT_EFFORT,
  EMPTY_SCRIPTS,
  type AgentKind,
  type AskChat,
  type ChatItem,
  type Repo,
  type Settings,
  type Workspace,
} from '../shared/model';
import type { FileSystem } from './file-system';

const STATE_FILE = 'korev-state.json';
const TRANSCRIPTS_DIR = 'transcripts';
const SAVE_DELAY_MS = 400;

export interface PersistedState {
  repos: Repo[];
  workspaces: Workspace[];
  askChats: AskChat[];
  settings: Settings;
}

export function defaultSettings(home: string): Settings {
  return {
    theme: 'system',
    defaultAgent: 'claude',
    defaultModels: { claude: CLAUDE_MODELS[0].id, codex: CODEX_DEFAULT_MODEL },
    branchPrefix: '',
    workspacesRoot: path.join(home, 'korev', 'workspaces'),
    defaultEffort: DEFAULT_EFFORT,
    defaultPlanMode: false,
    reviewModel: null,
    autoRenameBranches: true,
    deleteBranchOnArchive: false,
    archiveOnMerge: false,
    toolApprovals: false,
    loadout: [],
    snippets: [],
    editor: 'cursor',
    notifications: true,
    windowBounds: null,
  };
}

function isAgentKind(value: unknown): value is AgentKind {
  return AGENT_KINDS.includes(value as AgentKind);
}

function sanitize(raw: unknown, home: string): PersistedState {
  const value = (raw ?? {}) as Partial<PersistedState>;
  const defaults = defaultSettings(home);
  const settings = { ...defaults, ...value.settings };
  if (!isAgentKind(settings.defaultAgent)) settings.defaultAgent = 'claude';
  settings.defaultModels = {
    ...defaults.defaultModels,
    ...settings.defaultModels,
  };
  settings.defaultEffort = {
    ...defaults.defaultEffort,
    ...settings.defaultEffort,
  };
  const repos = Array.isArray(value.repos) ? value.repos : [];
  return {
    repos: repos.map((repo) => ({
      ...repo,
      scripts: { ...EMPTY_SCRIPTS, ...repo.scripts },
    })),
    workspaces: (Array.isArray(value.workspaces) ? value.workspaces : []).map(
      (workspace) => ({
        ...workspace,
        archiveSnapshot: workspace.archiveSnapshot ?? null,
        groupId: workspace.groupId ?? null,
        sessions: workspace.sessions.map((session) => ({
          ...session,
          effort: session.effort ?? defaults.defaultEffort[session.agent],
          fast: session.fast ?? false,
          planMode: session.planMode ?? settings.defaultPlanMode,
        })),
      }),
    ),
    askChats: Array.isArray(value.askChats) ? value.askChats : [],
    settings,
  };
}

export interface Store {
  state: PersistedState;
  save(): void;
  flush(): Promise<void>;
  loadTranscript(sessionId: string): Promise<ChatItem[]>;
  saveTranscript(sessionId: string, items: ChatItem[]): Promise<void>;
  removeTranscript(sessionId: string): Promise<void>;
}

const SESSION_ID_PATTERN = /^[\w-]+$/;

export async function openStore(
  fs: FileSystem,
  userDataPath: string,
  home: string,
): Promise<Store> {
  const statePath = path.join(userDataPath, STATE_FILE);
  const transcriptPath = (sessionId: string) => {
    if (!SESSION_ID_PATTERN.test(sessionId)) {
      throw new Error(`Invalid session id ${sessionId}`);
    }
    return path.join(userDataPath, TRANSCRIPTS_DIR, `${sessionId}.json`);
  };
  const raw = await fs.read(statePath);
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw.toString('utf8')) : null;
  } catch {
    parsed = null;
  }
  const state = sanitize(parsed, home);
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function flush() {
    if (timer) clearTimeout(timer);
    timer = null;
    await fs.writeAtomic(statePath, JSON.stringify(state, null, 2));
  }

  return {
    state,
    save() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    flush,
    async loadTranscript(sessionId) {
      const contents = await fs.read(transcriptPath(sessionId));
      if (!contents) return [];
      try {
        const items: unknown = JSON.parse(contents.toString('utf8'));
        return Array.isArray(items) ? (items as ChatItem[]) : [];
      } catch {
        return [];
      }
    },
    saveTranscript: (sessionId, items) =>
      fs.writeAtomic(transcriptPath(sessionId), JSON.stringify(items)),
    removeTranscript: (sessionId) => fs.remove(transcriptPath(sessionId)),
  };
}
