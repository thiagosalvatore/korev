import {
  CLAUDE_MODELS,
  CODEX_DEFAULT_MODEL,
  type AgentAvailability,
  type AgentKind,
  type AgentModel,
  type TurnUsage,
} from '../shared/model';
import type { CommandRunner } from './command-runner';
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
const STDIN_PROMPT = '-';

export interface TurnRequest {
  model: string;
  planMode: boolean;
  effort: string;
  fast: boolean;
  toolApprovals: boolean;
  resumeId: string | null;
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
  return request.toolApprovals ? 'default' : 'bypassPermissions';
}

function claudeArgs(request: TurnRequest): string[] {
  const session = request.resumeId
    ? ['--resume', request.resumeId]
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
    ...session,
  ];
}

function codexArgs(request: TurnRequest): string[] {
  const model =
    request.model && request.model !== CODEX_DEFAULT_MODEL
      ? ['--model', request.model]
      : [];
  const options = [
    '--json',
    '--skip-git-repo-check',
    '-c',
    `sandbox_mode="${request.planMode ? 'read-only' : 'workspace-write'}"`,
    '-c',
    `model_reasoning_effort="${request.effort}"`,
    ...(request.fast ? ['-c', 'service_tier="fast"'] : []),
    ...model,
  ];
  if (request.resumeId) {
    return ['exec', 'resume', ...options, request.resumeId, STDIN_PROMPT];
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
): Promise<string | null> {
  try {
    const result = await run(binary, args, {
      env,
      timeoutMs: PROBE_TIMEOUT_MS,
    });
    return result.exitCode === 0 ? result.stdout : null;
  } catch {
    return null;
  }
}

const CODEX_FALLBACK_MODELS: AgentModel[] = [
  { id: CODEX_DEFAULT_MODEL, label: 'Codex default' },
];

async function codexModels(run: CommandRunner, env: NodeJS.ProcessEnv) {
  const output = await probe(run, env, 'codex', ['debug', 'models']);
  return [
    ...CODEX_FALLBACK_MODELS,
    ...(output ? parseCodexModels(output) : []),
  ];
}

export async function detectAgents(
  run: CommandRunner,
  env: NodeJS.ProcessEnv,
): Promise<AgentAvailability[]> {
  const [claude, codex] = await Promise.all([
    probe(run, env, 'claude', ['--version']),
    probe(run, env, 'codex', ['--version']),
  ]);
  return [
    {
      agent: 'claude',
      version: claude ? (VERSION_PATTERN.exec(claude)?.[0] ?? null) : null,
      models: CLAUDE_MODELS,
    },
    {
      agent: 'codex',
      version: codex ? (VERSION_PATTERN.exec(codex)?.[0] ?? null) : null,
      models: codex ? await codexModels(run, env) : CODEX_FALLBACK_MODELS,
    },
  ];
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
