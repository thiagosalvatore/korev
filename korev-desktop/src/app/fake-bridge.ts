import { vi } from 'vitest';
import type { AgentModel, AgentStatus } from '../shared/agents';
import type { AuthState } from '../shared/auth';
import type { InboxSnapshot } from '../shared/inbox';
import type { AppCommand, KorevBridge } from '../shared/ipc-contract';
import type { RepoOwner, RepoPage } from '../shared/repos';
import type { Settings } from '../shared/settings';
import {
  CONNECTED_AUTH,
  WATCHING_SETTINGS,
  makeRepoPage,
  makeSnapshot,
} from './test-fixtures';

export interface FakeBridgeOptions {
  snapshot?: InboxSnapshot;
  auth?: AuthState;
  settings?: Settings;
  suggestedRepos?: string[];
  owners?: RepoOwner[];
  pages?: RepoPage[];
  agents?: AgentStatus[];
  agentModels?: AgentModel[];
}

export interface FakeBridge {
  bridge: KorevBridge;
  emitInbox: (snapshot: InboxSnapshot) => void;
  emitSettings: (settings: Settings) => void;
  emitCommand: (command: AppCommand) => void;
  stopInbox: ReturnType<typeof vi.fn>;
}

function findPage(
  pages: RepoPage[],
  owner: string,
  cursor: string | null,
): RepoPage {
  const ownerPages = pages.filter((page) => page.owner === owner);
  const index =
    cursor === null
      ? 0
      : ownerPages.findIndex((page) => page.nextCursor === cursor) + 1;
  return ownerPages[index] ?? makeRepoPage(owner, []);
}

export function installFakeBridge({
  snapshot = makeSnapshot(),
  auth = CONNECTED_AUTH,
  settings = WATCHING_SETTINGS,
  suggestedRepos = [],
  owners = [],
  pages = [],
  agents = [],
  agentModels = [],
}: FakeBridgeOptions = {}): FakeBridge {
  const inboxListeners = new Set<(next: InboxSnapshot) => void>();
  const settingsListeners = new Set<(next: Settings) => void>();
  const stopInbox = vi.fn();
  const commandListeners = new Set<(command: AppCommand) => void>();
  const bridge: KorevBridge = {
    inbox: {
      load: vi.fn(async () => snapshot),
      refresh: vi.fn(async () => undefined),
      onUpdated: vi.fn((listener) => {
        inboxListeners.add(listener);
        return () => {
          inboxListeners.delete(listener);
          stopInbox();
        };
      }),
    },
    auth: {
      getState: vi.fn(async () => auth),
      startDeviceFlow: vi.fn(async () => auth.login),
      cancelDeviceFlow: vi.fn(async () => undefined),
      useToken: vi.fn(async () => ({ ok: false as const, message: 'nope' })),
      disconnect: vi.fn(async () => undefined),
      retryUnlock: vi.fn(async () => undefined),
      onChanged: vi.fn(() => () => undefined),
    },
    settings: {
      load: vi.fn(async () => settings),
      setRepos: vi.fn(async (repos: string[]) => ({ ...settings, repos })),
      setTheme: vi.fn(async (theme) => ({ ...settings, theme })),
      setLastView: vi.fn(async (lastView) => ({ ...settings, lastView })),
      setMergeWith: vi.fn(async (repo, tool) => ({
        ...settings,
        mergeWith: { ...settings.mergeWith, [repo]: tool },
      })),
      setCollapsedSection: vi.fn(async (section, collapsed) => ({
        ...settings,
        collapsedSections: {
          ...settings.collapsedSections,
          [section]: collapsed,
        },
      })),
      setAgent: vi.fn(async (agent) => ({ ...settings, agent })),
      suggestedRepos: vi.fn(async () => suggestedRepos),
      onChanged: vi.fn((listener) => {
        settingsListeners.add(listener);
        return () => settingsListeners.delete(listener);
      }),
    },
    repos: {
      owners: vi.fn(async () => owners),
      page: vi.fn(async (owner: string, cursor: string | null) =>
        findPage(pages, owner, cursor),
      ),
      search: vi.fn(async () => []),
    },
    pr: {
      merge: vi.fn(async () => ({ ok: true as const })),
      close: vi.fn(async () => ({ ok: true as const })),
      reopen: vi.fn(async () => ({ ok: true as const })),
      cancelQueue: vi.fn(async () => ({ ok: true as const })),
    },
    agents: {
      statuses: vi.fn(async () => agents),
      signIn: vi.fn(async () => agents),
      cancelSignIn: vi.fn(async () => undefined),
      models: vi.fn(async () => agentModels),
      test: vi.fn(async () => ({ ok: true as const, output: 'OK' })),
    },
    shell: {
      openGithub: vi.fn(async () => undefined),
      openAgentInstall: vi.fn(async () => undefined),
    },
    app: {
      onCommand: vi.fn((listener) => {
        commandListeners.add(listener);
        return () => commandListeners.delete(listener);
      }),
    },
  };
  window.korev = bridge;
  return {
    bridge,
    emitInbox: (next) => inboxListeners.forEach((listener) => listener(next)),
    emitSettings: (next) =>
      settingsListeners.forEach((listener) => listener(next)),
    emitCommand: (command) =>
      commandListeners.forEach((listener) => listener(command)),
    stopInbox,
  };
}

export function installMatchMedia(matches = false) {
  window.matchMedia = vi.fn((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  }));
}
