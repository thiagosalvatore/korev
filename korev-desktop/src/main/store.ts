import path from 'node:path';
import {
  AGENT_KINDS,
  CLAUDE_MODELS,
  DEFAULT_EFFORT,
  EMPTY_SCRIPTS,
  loadoutKey,
  runScriptsFromText,
  type AgentKind,
  type AskChat,
  type Automation,
  type ChatItem,
  type ChatSession,
  type OrchestrationRun,
  type Repo,
  type RepoFolder,
  type WorkspaceFolder,
  type Settings,
  type Workspace,
} from '../shared/model';
import type { ExplainerContent } from '../shared/explainer';
import { ALL_DAYS } from '../shared/schedule';
import type { FileSystem } from './file-system';
import { DEFAULT_REMOTE_PORT } from './remote-server';

const STATE_FILE = 'korev-state.json';
const LEGACY_CODEX_DEFAULT_MODEL = 'default';
const TRANSCRIPTS_DIR = 'transcripts';
const EXPLAINERS_DIR = 'explainers';
const EXPLAINER_GUIDE = 'how-to-explain.md';
const INTERRUPTED_EXPLAINER =
  'Korev closed before the explanation was finished.';
export const ATTACHMENTS_DIR = 'attachments';
const SAVE_DELAY_MS = 400;
const JSON_EXTENSION = '.json';
const PATCH_EXTENSION = '.diff';

export interface PersistedState {
  repos: Repo[];
  folders: RepoFolder[];
  rootOrder: string[];
  workspaces: Workspace[];
  workspaceFolders: WorkspaceFolder[];
  askChats: AskChat[];
  runs: OrchestrationRun[];
  automations: Automation[];
  settings: Settings;
}

type AutomationBeforeSchedules = Automation & { intervalMinutes?: number };

function withSchedule({
  intervalMinutes,
  ...automation
}: AutomationBeforeSchedules): Automation {
  if (automation.schedule || intervalMinutes === undefined) return automation;
  return {
    ...automation,
    schedule: {
      kind: 'interval',
      minutes: intervalMinutes,
      days: ALL_DAYS,
      window: null,
    },
  };
}

function interruptedAfterRestart(run: OrchestrationRun): OrchestrationRun {
  return {
    ...run,
    heldMessages: run.heldMessages ?? [],
    questions: run.questions ?? [],
    gates: run.gates ?? [],
    tasks: run.tasks.map((task) =>
      task.status === 'dispatched' ? { ...task, status: 'interrupted' } : task,
    ),
  };
}

export function defaultSettings(home: string): Settings {
  return {
    theme: 'system',
    defaultAgent: 'claude',
    defaultModels: { claude: CLAUDE_MODELS[0].id, codex: '' },
    branchPrefix: '',
    workspacesRoot: path.join(home, 'korev', 'workspaces'),
    defaultEffort: DEFAULT_EFFORT,
    defaultPlanMode: false,
    reviewModel: null,
    explainModel: null,
    autoRenameBranches: true,
    deleteBranchOnArchive: false,
    archiveOnMerge: false,
    toolApprovals: false,
    askFollowsToolApprovals: false,
    orchestration: true,
    loadout: [],
    snippets: [],
    editor: 'cursor',
    notifications: true,
    notificationSound: true,
    notificationSoundFile: '',
    keepAwake: true,
    signAgentCommits: false,
    remoteAccess: false,
    remotePort: DEFAULT_REMOTE_PORT,
    phoneNotificationsUrl: '',
    dictationLanguage: 'auto',
    windowBounds: null,
    lastSeenVersion: null,
  };
}

function isAgentKind(value: unknown): value is AgentKind {
  return AGENT_KINDS.includes(value as AgentKind);
}

function isLegacyCodexDefault(agent: AgentKind, model: string) {
  return agent === 'codex' && model === LEGACY_CODEX_DEFAULT_MODEL;
}

function withoutLegacyCodexDefault(agent: AgentKind, model: string) {
  return isLegacyCodexDefault(agent, model) ? '' : model;
}

function sessionWithoutLegacyCodexDefault(session: ChatSession): ChatSession {
  return {
    ...session,
    model: withoutLegacyCodexDefault(session.agent, session.model),
  };
}

function explainerAfterRestart(session: ChatSession): ChatSession {
  if (session.explainer?.status !== 'writing') return session;
  return {
    ...session,
    explainer: {
      ...session.explainer,
      status: 'failed',
      error: INTERRUPTED_EXPLAINER,
    },
  };
}

function restoredSession(session: ChatSession): ChatSession {
  return explainerAfterRestart(sessionWithoutLegacyCodexDefault(session));
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
  settings.defaultModels.codex = withoutLegacyCodexDefault(
    'codex',
    settings.defaultModels.codex,
  );
  if (
    settings.reviewModel &&
    isLegacyCodexDefault(settings.reviewModel.agent, settings.reviewModel.model)
  )
    settings.reviewModel = null;
  settings.loadout = settings.loadout.filter(
    (key) => key !== loadoutKey('codex', LEGACY_CODEX_DEFAULT_MODEL),
  );
  settings.defaultEffort = {
    ...defaults.defaultEffort,
    ...settings.defaultEffort,
  };
  const repos = Array.isArray(value.repos) ? value.repos : [];
  return {
    repos: repos.map((repo) => ({
      ...repo,
      scripts: {
        ...EMPTY_SCRIPTS,
        ...repo.scripts,
        run: runScriptsFromText(repo.scripts?.run),
      },
      folderId: repo.folderId ?? null,
    })),
    folders: Array.isArray(value.folders) ? value.folders : [],
    rootOrder: Array.isArray(value.rootOrder) ? value.rootOrder : [],
    workspaces: (Array.isArray(value.workspaces) ? value.workspaces : []).map(
      (workspace) => ({
        ...workspace,
        archiveSnapshot: workspace.archiveSnapshot ?? null,
        restoredAt: workspace.restoredAt ?? null,
        label: workspace.label ?? null,
        keepAfterMerge: workspace.keepAfterMerge ?? false,
        awaitsLane: workspace.awaitsLane ?? false,
        groupId: workspace.groupId ?? null,
        folderId: workspace.folderId ?? null,
        prs: workspace.prs ?? [],
        sessions: workspace.sessions.map((session) => ({
          ...restoredSession(session),
          effort: session.effort ?? defaults.defaultEffort[session.agent],
          fast: session.fast ?? false,
          forkOnNextTurn: session.forkOnNextTurn ?? false,
          planMode: session.planMode ?? settings.defaultPlanMode,
        })),
      }),
    ),
    workspaceFolders: Array.isArray(value.workspaceFolders)
      ? value.workspaceFolders
      : [],
    askChats: (Array.isArray(value.askChats) ? value.askChats : []).map(
      (ask) => ({
        ...ask,
        session: restoredSession(ask.session),
        lastMessageAt: ask.lastMessageAt ?? ask.createdAt,
      }),
    ),
    runs: (Array.isArray(value.runs) ? value.runs : []).map(
      interruptedAfterRestart,
    ),
    automations: (Array.isArray(value.automations)
      ? value.automations
      : []
    ).map(withSchedule),
    settings,
  };
}

export interface Store {
  state: PersistedState;
  save(): void;
  flush(): Promise<void>;
  loadTranscript(sessionId: string): Promise<ChatItem[]>;
  saveTranscript(sessionId: string, items: ChatItem[]): Promise<void>;
  removeSession(sessionId: string): Promise<void>;
  explainersDir: string;
  explainerPatchPath(sessionId: string): string;
  loadExplainer(sessionId: string): Promise<StoredExplainer>;
  saveExplainerPatch(sessionId: string, patch: string): Promise<void>;
  saveExplainerGuide(guide: string): Promise<string>;
  saveExplainerContent(
    sessionId: string,
    content: ExplainerContent,
  ): Promise<void>;
}

export interface StoredExplainer {
  patch: string;
  content: ExplainerContent | null;
}

export function attachmentsDir(userDataPath: string): string {
  return path.join(userDataPath, ATTACHMENTS_DIR);
}

const SESSION_ID_PATTERN = /^[\w-]+$/;

export async function openStore(
  fs: FileSystem,
  userDataPath: string,
  home: string,
): Promise<Store> {
  const statePath = path.join(userDataPath, STATE_FILE);
  const sessionFile = (dir: string, sessionId: string, extension: string) => {
    if (!SESSION_ID_PATTERN.test(sessionId)) {
      throw new Error(`Invalid session id ${sessionId}`);
    }
    return path.join(userDataPath, dir, `${sessionId}${extension}`);
  };
  const transcriptPath = (sessionId: string) =>
    sessionFile(TRANSCRIPTS_DIR, sessionId, JSON_EXTENSION);
  const explainerPatchPath = (sessionId: string) =>
    sessionFile(EXPLAINERS_DIR, sessionId, PATCH_EXTENSION);
  const explainerContentPath = (sessionId: string) =>
    sessionFile(EXPLAINERS_DIR, sessionId, JSON_EXTENSION);

  async function readJson(file: string): Promise<unknown> {
    const contents = await fs.read(file);
    if (!contents) return null;
    try {
      return JSON.parse(contents.toString('utf8'));
    } catch {
      return null;
    }
  }
  const raw = await fs.read(statePath);
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw.toString('utf8')) : null;
  } catch {
    parsed = null;
  }
  const state = sanitize(parsed, home);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastWrite: Promise<void> = Promise.resolve();

  function flush() {
    if (timer) clearTimeout(timer);
    timer = null;
    const write = () =>
      fs.writeAtomic(statePath, JSON.stringify(state, null, 2));
    lastWrite = lastWrite.catch(() => undefined).then(write);
    return lastWrite;
  }

  return {
    state,
    save() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    flush,
    async loadTranscript(sessionId) {
      const items = await readJson(transcriptPath(sessionId));
      return Array.isArray(items) ? (items as ChatItem[]) : [];
    },
    saveTranscript: (sessionId, items) =>
      fs.writeAtomic(transcriptPath(sessionId), JSON.stringify(items)),
    async removeSession(sessionId) {
      await Promise.all([
        fs.remove(transcriptPath(sessionId)),
        fs.remove(explainerPatchPath(sessionId)),
        fs.remove(explainerContentPath(sessionId)),
      ]);
    },
    explainersDir: path.join(userDataPath, EXPLAINERS_DIR),
    explainerPatchPath,
    async loadExplainer(sessionId) {
      const [patch, content] = await Promise.all([
        fs.read(explainerPatchPath(sessionId)),
        readJson(explainerContentPath(sessionId)),
      ]);
      return {
        patch: patch?.toString('utf8') ?? '',
        content: (content as ExplainerContent | null) ?? null,
      };
    },
    saveExplainerPatch: (sessionId, patch) =>
      fs.writeAtomic(explainerPatchPath(sessionId), patch),
    async saveExplainerGuide(guide) {
      const file = path.join(userDataPath, EXPLAINERS_DIR, EXPLAINER_GUIDE);
      await fs.writeAtomic(file, guide);
      return file;
    },
    saveExplainerContent: (sessionId, content) =>
      fs.writeAtomic(explainerContentPath(sessionId), JSON.stringify(content)),
  };
}
