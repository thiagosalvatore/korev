import type {
  AgentModel,
  AgentProvider,
  AgentRunResult,
} from '../../shared/agents';
import type { CommandResult } from './command-runner';

export interface SignInState {
  signedIn: boolean;
  plan: string | null;
}

export type RunProviderCommand = (args: string[]) => Promise<CommandResult>;

export interface ProviderDefinition {
  binary: string;
  versionArgs: string[];
  statusArgs: string[];
  parseStatus(result: CommandResult): SignInState;
  loginArgs: string[] | null;
  listModels(run: RunProviderCommand): Promise<AgentModel[]>;
  runArgs(model: string | null): string[];
  parseRun(stdout: string): AgentRunResult | null;
}

const VERSION_PATTERN = /\d+\.\d+\.\d+\S*/;
const STDIN_PROMPT = '-';
const LISTED_MODEL_VISIBILITY = 'list';
const CODEX_PLANS = ['ChatGPT', 'API key'];

const CLAUDE_MODELS: AgentModel[] = [
  { id: 'fable', label: 'Fable' },
  { id: 'opus', label: 'Opus' },
  { id: 'sonnet', label: 'Sonnet' },
];

type JsonRecord = Record<string, unknown>;

function parseJson(text: string): JsonRecord | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? (parsed as JsonRecord) : null;
  } catch {
    return null;
  }
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function modelArgs(flag: string, model: string | null): string[] {
  return model ? [flag, model] : [];
}

export function extractVersion(output: string): string | null {
  return VERSION_PATTERN.exec(output)?.[0] ?? null;
}

function parseClaudeStatus({ stdout }: CommandResult): SignInState {
  const status = parseJson(stdout);
  const plan = status?.subscriptionType;
  return {
    signedIn: status?.loggedIn === true,
    plan:
      typeof plan === 'string' && plan ? `Claude ${capitalize(plan)}` : null,
  };
}

function parseClaudeRun(stdout: string): AgentRunResult | null {
  const result = parseJson(stdout);
  if (typeof result?.result !== 'string') return null;
  return result.is_error === true
    ? { ok: false, message: result.result }
    : { ok: true, output: result.result };
}

function parseCodexStatus(result: CommandResult): SignInState {
  const output = `${result.stdout}${result.stderr}`;
  return {
    signedIn: result.exitCode === 0,
    plan: CODEX_PLANS.find((plan) => output.includes(plan)) ?? null,
  };
}

interface CodexCatalogModel {
  slug: string;
  display_name: string;
  visibility: string;
  priority: number;
}

function isListedCodexModel(value: unknown): value is CodexCatalogModel {
  const model = value as Partial<CodexCatalogModel>;
  return (
    typeof model?.slug === 'string' &&
    typeof model.display_name === 'string' &&
    typeof model.priority === 'number' &&
    model.visibility === LISTED_MODEL_VISIBILITY
  );
}

export function parseCodexModels(stdout: string): AgentModel[] {
  const catalog = parseJson(stdout)?.models;
  if (!Array.isArray(catalog)) return [];
  return catalog
    .filter(isListedCodexModel)
    .sort((left, right) => left.priority - right.priority)
    .map((model) => ({ id: model.slug, label: model.display_name }));
}

function codexEventMessage(event: JsonRecord): string | null {
  const error = event.error as JsonRecord | undefined;
  const message = event.type === 'error' ? event.message : error?.message;
  return typeof message === 'string' ? message : null;
}

function codexAgentMessage(event: JsonRecord): string | null {
  const item = event.item as JsonRecord | undefined;
  if (event.type !== 'item.completed' || item?.type !== 'agent_message') {
    return null;
  }
  return typeof item.text === 'string' ? item.text : null;
}

function parseCodexRun(stdout: string): AgentRunResult | null {
  let outcome: AgentRunResult | null = null;
  for (const line of stdout.split('\n')) {
    const event = parseJson(line);
    if (!event) continue;
    const output = codexAgentMessage(event);
    const failure = codexEventMessage(event);
    if (output !== null) outcome = { ok: true, output };
    else if (failure !== null) outcome = { ok: false, message: failure };
  }
  return outcome;
}

export const PROVIDERS: Record<AgentProvider, ProviderDefinition> = {
  claude: {
    binary: 'claude',
    versionArgs: ['--version'],
    statusArgs: ['auth', 'status', '--json'],
    parseStatus: parseClaudeStatus,
    loginArgs: null,
    listModels: async () => CLAUDE_MODELS,
    runArgs: (model) => [
      '-p',
      '--output-format',
      'json',
      '--no-session-persistence',
      ...modelArgs('--model', model),
    ],
    parseRun: parseClaudeRun,
  },
  codex: {
    binary: 'codex',
    versionArgs: ['--version'],
    statusArgs: ['login', 'status'],
    parseStatus: parseCodexStatus,
    loginArgs: ['login'],
    listModels: async (run) =>
      parseCodexModels((await run(['debug', 'models'])).stdout),
    runArgs: (model) => [
      'exec',
      '--json',
      '--ephemeral',
      '--skip-git-repo-check',
      '--sandbox',
      'read-only',
      ...modelArgs('--model', model),
      STDIN_PROMPT,
    ],
    parseRun: parseCodexRun,
  },
};
