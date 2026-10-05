import type { AgentActivityLine } from '../../shared/agent-tasks';
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
  parseActivity(line: string): AgentActivityLine[];
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

function parseClaudeStatus({ stdout }: CommandResult): SignInState {
  const status = parseJson(stdout);
  const plan = status?.subscriptionType;
  return {
    signedIn: status?.loggedIn === true,
    plan:
      typeof plan === 'string' && plan ? `Claude ${capitalize(plan)}` : null,
  };
}

const CLAUDE_RESULT_EVENT = 'result';
const CLAUDE_ASSISTANT_EVENT = 'assistant';
const CODEX_ITEM_COMPLETED = 'item.completed';

const CLAUDE_TOOL_VERBS: Record<string, { verb: string; field: string }> = {
  Read: { verb: 'Read', field: 'file_path' },
  Grep: { verb: 'Searched for', field: 'pattern' },
  Glob: { verb: 'Listed', field: 'pattern' },
  Edit: { verb: 'Edited', field: 'file_path' },
  Write: { verb: 'Wrote', field: 'file_path' },
  Bash: { verb: 'Ran', field: 'command' },
};

function jsonLines(stdout: string): JsonRecord[] {
  return stdout.split('\n').flatMap((line): JsonRecord[] => {
    const event = parseJson(line);
    return event ? [event] : [];
  });
}

function step(text: string): AgentActivityLine {
  return { kind: 'step', text };
}

function message(text: string): AgentActivityLine {
  return { kind: 'message', text };
}

function claudeToolStep(block: JsonRecord): AgentActivityLine | null {
  const tool = CLAUDE_TOOL_VERBS[String(block.name)];
  const input = block.input as JsonRecord | undefined;
  const target = tool ? input?.[tool.field] : undefined;
  return typeof target === 'string' ? step(`${tool.verb} ${target}`) : null;
}

function claudeBlockActivity(block: JsonRecord): AgentActivityLine | null {
  if (block.type === 'tool_use') return claudeToolStep(block);
  if (block.type === 'text' && typeof block.text === 'string') {
    return block.text.trim() ? message(block.text.trim()) : null;
  }
  return null;
}

function parseClaudeActivity(line: string): AgentActivityLine[] {
  const event = parseJson(line);
  if (event?.type !== CLAUDE_ASSISTANT_EVENT) return [];
  const content = (event.message as JsonRecord | undefined)?.content;
  if (!Array.isArray(content)) return [];
  return content.flatMap(
    (block: JsonRecord) => claudeBlockActivity(block) ?? [],
  );
}

function parseClaudeRun(stdout: string): AgentRunResult | null {
  const result =
    jsonLines(stdout).findLast((event) => event.type === CLAUDE_RESULT_EVENT) ??
    null;
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
  if (event.type !== 'item.completed' || item?.type !== 'agent_message') {
    return null;
  }
  return typeof item.text === 'string' ? item.text : null;
}

function codexFileChange(item: JsonRecord): AgentActivityLine | null {
  if (!Array.isArray(item.changes)) return null;
  const paths = item.changes.flatMap((change: JsonRecord) =>
    typeof change.path === 'string' ? [change.path] : [],
  );
  return paths.length > 0 ? step(`Edited ${paths.join(', ')}`) : null;
}

function codexItemActivity(item: JsonRecord): AgentActivityLine | null {
  if (item.type === 'command_execution' && typeof item.command === 'string') {
    return step(`Ran ${item.command}`);
  }
  if (item.type === 'file_change') return codexFileChange(item);
  if (item.type === 'agent_message' && typeof item.text === 'string') {
    return message(item.text);
  }
  return null;
}

function parseCodexActivity(line: string): AgentActivityLine[] {
  const event = parseJson(line);
  const item = event?.item as JsonRecord | undefined;
  if (event?.type !== CODEX_ITEM_COMPLETED || !item) return [];
  const activity = codexItemActivity(item);
  return activity ? [activity] : [];
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
    parseActivity: parseClaudeActivity,
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
    parseActivity: parseCodexActivity,
  },
};
