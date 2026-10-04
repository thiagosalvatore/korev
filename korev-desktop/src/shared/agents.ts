export type AgentProvider = 'claude' | 'codex';

export const AGENT_PROVIDERS: readonly AgentProvider[] = ['claude', 'codex'];

export interface AgentInfo {
  label: string;
  installUrl: string;
  terminalSignInCommand: string | null;
}

export const AGENT_INFO: Record<AgentProvider, AgentInfo> = {
  claude: {
    label: 'Claude Code',
    installUrl: 'https://code.claude.com/docs/en/setup',
    terminalSignInCommand: 'claude auth login',
  },
  codex: {
    label: 'Codex',
    installUrl: 'https://developers.openai.com/codex/cli',
    terminalSignInCommand: null,
  },
};

export type AgentAccess = 'read-only' | 'edit';

export interface AgentStatus {
  provider: AgentProvider;
  installed: boolean;
  version: string | null;
  signedIn: boolean;
  plan: string | null;
  problem: string | null;
}

export interface AgentModel {
  id: string;
  label: string;
}

export interface AgentPreference {
  provider: AgentProvider | null;
  models: Partial<Record<AgentProvider, string>>;
}

export type AgentRunResult =
  | { ok: true; output: string }
  | { ok: false; message: string };

const MODEL_ID_PATTERN = /^[A-Za-z0-9][\w.:[\]-]*$/;

export function isAgentProvider(value: unknown): value is AgentProvider {
  return AGENT_PROVIDERS.includes(value as AgentProvider);
}

export function isModelId(value: unknown): value is string {
  return typeof value === 'string' && MODEL_ID_PATTERN.test(value);
}
