import {
  CLAUDE_MODELS,
  CODEX_DEFAULT_MODEL,
  type AgentAvailability,
  type AgentKind,
  type AgentModel,
} from '../shared/model';
import type { CommandRunner } from './command-runner';
import {
  createClaudeParser,
  createCodexParser,
  parseJsonLine,
  type TurnParser,
} from './agent-events';

const VERSION_PATTERN = /\d+\.\d+\.\d+\S*/;
const PROBE_TIMEOUT_MS = 15_000;
const LISTED_MODEL_VISIBILITY = 'list';
const STDIN_PROMPT = '-';

export interface TurnRequest {
  model: string;
  planMode: boolean;
  effort: string;
  resumeId: string | null;
  newSessionId: string;
  systemPrompt: string;
}

export interface AgentDefinition {
  binary: string;
  args(request: TurnRequest): string[];
  parser(cwd: string): TurnParser;
}

function claudeArgs(request: TurnRequest): string[] {
  const session = request.resumeId
    ? ['--resume', request.resumeId]
    : ['--session-id', request.newSessionId];
  return [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--model',
    request.model,
    '--permission-mode',
    request.planMode ? 'plan' : 'bypassPermissions',
    '--effort',
    request.effort,
    '--append-system-prompt',
    request.systemPrompt,
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
    args: claudeArgs,
    parser: createClaudeParser,
  },
  codex: {
    binary: 'codex',
    args: codexArgs,
    parser: createCodexParser,
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
