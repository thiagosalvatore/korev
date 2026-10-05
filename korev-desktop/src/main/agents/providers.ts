import type {
  AgentAccess,
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

export interface OutputSchema {
  json: string;
  path: string;
}

export interface RunOptions {
  model: string | null;
  access: AgentAccess;
  schema: OutputSchema | null;
  network: boolean;
}

export interface ProviderDefinition {
  binary: string;
  versionArgs: string[];
  statusArgs: string[];
  parseStatus(result: CommandResult): SignInState;
  loginArgs: string[] | null;
  listModels(run: RunProviderCommand): Promise<AgentModel[]>;
  runArgs(options: RunOptions): string[];
  parseRun(stdout: string): AgentRunResult | null;
  describeEvent(line: string): string[];
}

const VERSION_PATTERN = /\d+\.\d+\.\d+\S*/;
const STDIN_PROMPT = '-';
const LISTED_MODEL_VISIBILITY = 'list';
const CODEX_PLANS = ['ChatGPT', 'API key'];

const CLAUDE_READ_TOOLS = ['Read', 'Grep', 'Glob'];
const CLAUDE_EDIT_TOOLS = [...CLAUDE_READ_TOOLS, 'Edit', 'Write', 'Bash'];
export const PACKAGE_REGISTRY_DOMAINS: readonly string[] = [
  'registry.npmjs.org',
  'registry.yarnpkg.com',
  'pypi.org',
  'files.pythonhosted.org',
  'crates.io',
  'index.crates.io',
  'static.crates.io',
  'proxy.golang.org',
  'sum.golang.org',
  'rubygems.org',
  'index.rubygems.org',
];

const CLAUDE_SANDBOX = {
  enabled: true,
  allowUnsandboxedCommands: false,
  failIfUnavailable: true,
};

const CLAUDE_REGISTRY_NETWORK = {
  allowedDomains: PACKAGE_REGISTRY_DOMAINS,
  strictAllowlist: true,
};

const CODEX_NETWORK_ARGS = [
  '-c',
  'sandbox_workspace_write.network_access=true',
];

function claudeSandboxSettings(network: boolean): string {
  return JSON.stringify({
    sandbox: network
      ? { ...CLAUDE_SANDBOX, network: CLAUDE_REGISTRY_NETWORK }
      : CLAUDE_SANDBOX,
  });
}

function claudeAccessArgs(access: AgentAccess, network: boolean): string[] {
  if (access === 'read-only') {
    return [
      '--restricted',
      '--tools',
      CLAUDE_READ_TOOLS.join(','),
      '--permission-prompts',
      'none',
    ];
  }
  return [
    '--restricted',
    '--tools',
    CLAUDE_EDIT_TOOLS.join(','),
    '--permission-mode',
    'acceptEdits',
    '--permission-prompts',
    'none',
    '--settings',
    claudeSandboxSettings(network),
  ];
}

function codexNetworkArgs(access: AgentAccess, network: boolean): string[] {
  return access === 'edit' && network ? CODEX_NETWORK_ARGS : [];
}

const CODEX_SANDBOX: Record<AgentAccess, string> = {
  'read-only': 'read-only',
  edit: 'workspace-write',
};

const CLAUDE_MODELS: AgentModel[] = [
  { id: 'claude-fable-5-1', label: 'Fable 5.1' },
  { id: 'claude-opus-5-5', label: 'Opus 5.5' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
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

function optionArgs(flag: string, value: string | null | undefined): string[] {
  return value ? [flag, value] : [];
}

export function extractVersion(output: string): string | null {
  return VERSION_PATTERN.exec(output)?.[0] ?? null;
}

const CLAUDE_RESULT_EVENT = 'result';
const CLAUDE_SHELL_TOOL = 'Bash';
const CODEX_FINISHED_ITEM = 'item.completed';
const EDIT_LINE_PREFIX = 'Edit';

function asJsonRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' ? (value as JsonRecord) : {};
}

function textOf(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isLine(value: string | null): value is string {
  return value !== null;
}

function commandLine(command: unknown): string | null {
  const text = textOf(command);
  return text ? `$ ${text}` : null;
}

function claudeToolLine(name: string, input: JsonRecord): string | null {
  if (name === CLAUDE_SHELL_TOOL) return commandLine(input.command);
  const target =
    textOf(input.file_path) ?? textOf(input.pattern) ?? textOf(input.path);
  return target ? `${name} ${target}` : name;
}

function describeClaudeBlock(block: JsonRecord): string | null {
  if (block.type === 'text') return textOf(block.text);
  if (block.type !== 'tool_use' || typeof block.name !== 'string') return null;
  return claudeToolLine(block.name, asJsonRecord(block.input));
}

function describeClaudeEvent(line: string): string[] {
  const event = parseJson(line);
  if (event?.type !== 'assistant') return [];
  const content = asJsonRecord(event.message).content;
  if (!Array.isArray(content)) return [];
  return content
    .map((block) => describeClaudeBlock(asJsonRecord(block)))
    .filter(isLine);
}

function codexFileChanges(changes: unknown): string[] {
  if (!Array.isArray(changes)) return [];
  return changes
    .map((change) => textOf(asJsonRecord(change).path))
    .filter(isLine)
    .map((path) => `${EDIT_LINE_PREFIX} ${path}`);
}

function describeCodexItem(item: JsonRecord): string[] {
  switch (item.type) {
    case 'agent_message':
    case 'reasoning':
      return [textOf(item.text)].filter(isLine);
    case 'command_execution':
      return [commandLine(item.command)].filter(isLine);
    case 'file_change':
      return codexFileChanges(item.changes);
    default:
      return [];
  }
}

function describeCodexEvent(line: string): string[] {
  const event = parseJson(line);
  if (event?.type !== CODEX_FINISHED_ITEM) return [];
  return describeCodexItem(asJsonRecord(event.item));
}

function lastClaudeResult(stdout: string): JsonRecord | null {
  const results = stdout
    .split('\n')
    .map(parseJson)
    .filter((event) => event?.type === CLAUDE_RESULT_EVENT);
  return results.at(-1) ?? null;
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
  const result = lastClaudeResult(stdout);
  if (typeof result?.result !== 'string') return null;
  if (result.is_error === true) return { ok: false, message: result.result };
  const structured = result.structured_output;
  return {
    ok: true,
    output:
      structured && typeof structured === 'object'
        ? JSON.stringify(structured)
        : result.result,
  };
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
  if (event.type !== CODEX_FINISHED_ITEM || item?.type !== 'agent_message') {
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
    runArgs: ({ model, access, schema, network }) => [
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--no-session-persistence',
      ...claudeAccessArgs(access, network),
      ...optionArgs('--model', model),
      ...optionArgs('--json-schema', schema?.json),
    ],
    parseRun: parseClaudeRun,
    describeEvent: describeClaudeEvent,
  },
  codex: {
    binary: 'codex',
    versionArgs: ['--version'],
    statusArgs: ['login', 'status'],
    parseStatus: parseCodexStatus,
    loginArgs: ['login'],
    listModels: async (run) =>
      parseCodexModels((await run(['debug', 'models'])).stdout),
    runArgs: ({ model, access, schema, network }) => [
      'exec',
      '--json',
      '--ephemeral',
      '--skip-git-repo-check',
      '--sandbox',
      CODEX_SANDBOX[access],
      ...codexNetworkArgs(access, network),
      ...optionArgs('--model', model),
      ...optionArgs('--output-schema', schema?.path),
      STDIN_PROMPT,
    ],
    parseRun: parseCodexRun,
    describeEvent: describeCodexEvent,
  },
};
