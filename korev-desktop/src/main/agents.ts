import {
  AGENT_KINDS,
  CLAUDE_MODELS,
  isAgentReady,
  type AgentAccount,
  type AgentAvailability,
  type AgentKind,
  type AgentModel,
  type TurnUsage,
} from '../shared/model';
import type { CommandResult, CommandRunner } from './command-runner';
import {
  createClaudeParser,
  createCodexParser,
  parseJsonLine,
  type TurnParser,
} from './agent-events';
import { readCodexUsage } from './codex-usage';

const VERSION_PATTERN = /\d+\.\d+\.\d+\S*/;
const PROBE_TIMEOUT_MS = 15_000;
const LISTED_MODEL_VISIBILITY = 'list';
const CODEX_SIGNED_IN_PATTERN = /Logged in using (.+)/;
const STDIN_PROMPT = '-';
const READ_ONLY_DISALLOWED_TOOLS = ['Edit', 'Write', 'NotebookEdit'];

export interface TurnRequest {
  model: string;
  planMode: boolean;
  readOnly: boolean;
  effort: string;
  fast: boolean;
  toolApprovals: boolean;
  resumeId: string | null;
  fork: boolean;
  newSessionId: string;
  systemPrompt: string;
  addDirs: string[];
}

export type AgentInput = 'stream-json' | 'prompt';

export interface AgentDefinition {
  binary: string;
  input: AgentInput;
  args(request: TurnRequest): string[];
  parser(cwd: string): TurnParser;
  usage(parser: TurnParser, env: NodeJS.ProcessEnv): Promise<TurnUsage | null>;
}

function claudePermissionMode(request: TurnRequest): string {
  if (request.planMode) return 'plan';
  return request.readOnly || request.toolApprovals
    ? 'default'
    : 'bypassPermissions';
}

function claudeArgs(request: TurnRequest): string[] {
  const session = request.resumeId
    ? [
        '--resume',
        request.resumeId,
        ...(request.fork ? ['--fork-session'] : []),
      ]
    : ['--session-id', request.newSessionId];
  return [
    '-p',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--permission-prompt-tool',
    'stdio',
    '--replay-user-messages',
    '--model',
    request.model,
    '--permission-mode',
    claudePermissionMode(request),
    '--settings',
    JSON.stringify({ fastMode: request.fast }),
    '--effort',
    request.effort,
    '--append-system-prompt',
    request.systemPrompt,
    ...request.addDirs.flatMap((dir) => ['--add-dir', dir]),
    ...(request.readOnly
      ? ['--disallowedTools', ...READ_ONLY_DISALLOWED_TOOLS]
      : []),
    ...session,
  ];
}

function codexArgs(request: TurnRequest): string[] {
  const model = request.model ? ['--model', request.model] : [];
  const options = [
    '--json',
    '--skip-git-repo-check',
    '-c',
    `sandbox_mode="${request.planMode || request.readOnly ? 'read-only' : 'workspace-write'}"`,
    '-c',
    'sandbox_workspace_write.network_access=true',
    '-c',
    `model_reasoning_effort="${request.effort}"`,
    ...(request.fast ? ['-c', 'service_tier="fast"'] : []),
    ...(request.addDirs.length
      ? [
          '-c',
          `sandbox_workspace_write.writable_roots=${JSON.stringify(request.addDirs)}`,
        ]
      : []),
    ...model,
  ];
  if (request.resumeId) {
    const mode = request.fork ? 'fork' : 'resume';
    return ['exec', mode, ...options, request.resumeId, STDIN_PROMPT];
  }
  return ['exec', ...options, STDIN_PROMPT];
}

export const AGENTS: Record<AgentKind, AgentDefinition> = {
  claude: {
    binary: 'claude',
    input: 'stream-json',
    args: claudeArgs,
    parser: createClaudeParser,
    usage: async (parser) => parser.usage(),
  },
  codex: {
    binary: 'codex',
    input: 'prompt',
    args: codexArgs,
    parser: createCodexParser,
    usage: (parser, env) => readCodexUsage(env, parser.sessionId()),
  },
};

export function codexPrompt(request: TurnRequest, text: string): string {
  if (request.resumeId) return text;
  return `<workspace-context>\n${request.systemPrompt}\n</workspace-context>\n\n${text}`;
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
  const catalog = parseJsonLine(stdout)?.models;
  if (!Array.isArray(catalog)) return [];
  return catalog
    .filter(isListedCodexModel)
    .sort((left, right) => left.priority - right.priority)
    .map((model) => ({ id: model.slug, label: model.display_name }));
}

async function probe(
  run: CommandRunner,
  env: NodeJS.ProcessEnv,
  binary: string,
  args: string[],
): Promise<CommandResult | null> {
  try {
    const result = await run(binary, args, {
      env,
      timeoutMs: PROBE_TIMEOUT_MS,
    });
    return result.exitCode === 0 ? result : null;
  } catch {
    return null;
  }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

export function parseClaudeAccount(stdout: string): AgentAccount | null {
  const status = parseJsonLine(stdout);
  if (status?.loggedIn !== true) return null;
  return {
    method: stringOrNull(status.authMethod),
    email: stringOrNull(status.email),
    organization: stringOrNull(status.orgName),
  };
}

export function parseCodexAccount(output: string): AgentAccount | null {
  const method = CODEX_SIGNED_IN_PATTERN.exec(output)?.[1].trim();
  return method ? { method, email: null, organization: null } : null;
}

interface AgentProbe {
  account(
    run: CommandRunner,
    env: NodeJS.ProcessEnv,
  ): Promise<AgentAccount | null>;
  models(run: CommandRunner, env: NodeJS.ProcessEnv): Promise<AgentModel[]>;
}

const AGENT_PROBES: Record<AgentKind, AgentProbe> = {
  claude: {
    async account(run, env) {
      const result = await probe(run, env, 'claude', ['auth', 'status']);
      return result ? parseClaudeAccount(result.stdout) : null;
    },
    models: async () => CLAUDE_MODELS,
  },
  codex: {
    async account(run, env) {
      const result = await probe(run, env, 'codex', ['login', 'status']);
      return result
        ? parseCodexAccount(`${result.stdout}\n${result.stderr}`)
        : null;
    },
    async models(run, env) {
      const result = await probe(run, env, 'codex', ['debug', 'models']);
      return result ? parseCodexModels(result.stdout) : [];
    },
  },
};

async function detectAgent(
  agent: AgentKind,
  run: CommandRunner,
  env: NodeJS.ProcessEnv,
): Promise<AgentAvailability> {
  const installed = await probe(run, env, AGENTS[agent].binary, ['--version']);
  const version = installed
    ? (VERSION_PATTERN.exec(installed.stdout)?.[0] ?? null)
    : null;
  const account = version ? await AGENT_PROBES[agent].account(run, env) : null;
  const models = account ? await AGENT_PROBES[agent].models(run, env) : [];
  return { agent, version, account, models };
}

export function detectAgents(
  run: CommandRunner,
  env: NodeJS.ProcessEnv,
): Promise<AgentAvailability[]> {
  return Promise.all(AGENT_KINDS.map((agent) => detectAgent(agent, run, env)));
}

export function reconcileDefaultModels(
  defaultModels: Record<AgentKind, string>,
  agents: AgentAvailability[],
): Record<AgentKind, string> {
  const reconciled = { ...defaultModels };
  for (const entry of agents) {
    const offered = entry.models.map((model) => model.id);
    const keep =
      !isAgentReady(entry) ||
      !offered.length ||
      offered.includes(reconciled[entry.agent]);
    if (!keep) reconciled[entry.agent] = offered[0];
  }
  return reconciled;
}

export function claudeUserMessage(text: string): string {
  return JSON.stringify({
    type: 'user',
    message: { role: 'user', content: text },
  });
}

export function isUserMessageAck(event: Record<string, unknown>): boolean {
  const message = event.message as { content?: unknown } | undefined;
  return event.type === 'user' && typeof message?.content === 'string';
}

const BACKGROUND_TASKS_CHANGED = 'background_tasks_changed';

export function backgroundTaskCount(
  event: Record<string, unknown>,
): number | null {
  if (event.type !== 'system' || event.subtype !== BACKGROUND_TASKS_CHANGED)
    return null;
  return Array.isArray(event.tasks) ? event.tasks.length : 0;
}
