import { realpathSync } from 'node:fs';
import path from 'node:path';
import {
  PLAN_TOOL,
  type AgentQuestion,
  type ChatItem,
  type PlanLimit,
  type Todo,
  type TodoStatus,
  type TurnUsage,
} from '../shared/model';

export type JsonRecord = Record<string, unknown>;

const DETAIL_MAX_CHARS = 20_000;
const OUTPUT_MAX_CHARS = 20_000;
const MS_PER_SECOND = 1_000;
const PERCENT = 100;

export interface TurnParser {
  feed(event: JsonRecord): ChatItem[];
  sessionId(): string | null;
  usage(): TurnUsage | null;
}

export function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' ? (value as JsonRecord) : {};
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function num(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

export function epochMs(seconds: unknown): number | null {
  return typeof seconds === 'number' ? seconds * MS_PER_SECOND : null;
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n…` : text;
}

export function parseJsonLine(line: string): JsonRecord | null {
  try {
    const parsed: unknown = JSON.parse(line);
    return parsed && typeof parsed === 'object' ? (parsed as JsonRecord) : null;
  } catch {
    return null;
  }
}

function realpath(dir: string): string {
  try {
    return realpathSync(dir);
  } catch {
    return dir;
  }
}

function relative(cwd: string, file: string): string {
  for (const root of new Set([cwd, realpath(cwd)])) {
    if (file.startsWith(`${root}/`)) return path.relative(root, file);
  }
  return file;
}

const CLAUDE_TOOL_TARGETS: Record<string, string> = {
  Read: 'file_path',
  Edit: 'file_path',
  MultiEdit: 'file_path',
  Write: 'file_path',
  NotebookEdit: 'notebook_path',
  Bash: 'command',
  Grep: 'pattern',
  Glob: 'pattern',
  WebFetch: 'url',
  WebSearch: 'query',
  Task: 'description',
  Agent: 'description',
  Skill: 'skill',
};

const PATH_FIELDS = new Set(['file_path', 'notebook_path']);

function firstString(input: JsonRecord): string {
  return Object.values(input).find((value) => typeof value === 'string') as
    | string
    | '';
}

function claudeToolSummary(name: string, input: JsonRecord, cwd: string) {
  const field = CLAUDE_TOOL_TARGETS[name];
  const target = field ? str(input[field]) : (firstString(input) ?? '');
  const shown =
    field && PATH_FIELDS.has(field) ? relative(cwd, target) : target;
  return shown.split('\n')[0];
}

function editDetail(input: JsonRecord): string | null {
  const oldText = str(input.old_string);
  const newText = str(input.new_string);
  if (!oldText && !newText) return null;
  const minus = oldText ? oldText.split('\n').map((line) => `- ${line}`) : [];
  const plus = newText.split('\n').map((line) => `+ ${line}`);
  return [...minus, ...plus].join('\n');
}

function claudeToolDetail(name: string, input: JsonRecord): string {
  if (name === 'Bash') return str(input.command);
  if (name === 'Write') return str(input.content);
  if (name === 'Edit') return editDetail(input) ?? '';
  if (name === PLAN_TOOL) return str(input.plan);
  return JSON.stringify(input, null, 2);
}

const TODO_STATUSES = new Set<TodoStatus>([
  'pending',
  'in_progress',
  'completed',
]);

function claudeTodos(input: JsonRecord): Todo[] {
  const todos = Array.isArray(input.todos) ? input.todos : [];
  return todos.map((todo) => {
    const entry = record(todo);
    const status = str(entry.status) as TodoStatus;
    return {
      text: str(entry.content),
      status: TODO_STATUSES.has(status) ? status : 'pending',
    };
  });
}

function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((block) => str(record(block).text))
    .filter(Boolean)
    .join('\n');
}

const TODO_TOOL = 'TodoWrite';

const CLAUDE_LIMIT_LABELS: Record<string, string> = {
  five_hour: '5-hour limit',
  seven_day: 'Weekly limit',
  seven_day_opus: 'Weekly Opus limit',
  seven_day_sonnet: 'Weekly Sonnet limit',
  seven_day_overage_included: 'Weekly limit with extra usage',
  overage: 'Extra usage',
};

function contextTokens(usage: JsonRecord): number {
  return (
    num(usage.input_tokens) +
    num(usage.cache_creation_input_tokens) +
    num(usage.cache_read_input_tokens) +
    num(usage.output_tokens)
  );
}

function claudeLimit(type: string, window: JsonRecord): PlanLimit {
  return {
    label: CLAUDE_LIMIT_LABELS[type] ?? type,
    usedPercent: Math.round(num(window.utilization) * PERCENT),
    resetsAt: epochMs(window.resetsAt),
  };
}

function claudeLimits(info: JsonRecord): PlanLimit[] {
  const windows = Object.entries(record(info.unifiedWindows));
  if (windows.length)
    return windows.map(([type, window]) => claudeLimit(type, record(window)));
  if (typeof info.utilization !== 'number') return [];
  return [claudeLimit(str(info.rateLimitType), info)];
}

function largestContextWindow(modelUsage: unknown): number {
  return Math.max(
    0,
    ...Object.values(record(modelUsage)).map((entry) =>
      num(record(entry).contextWindow),
    ),
  );
}

export function createClaudeParser(cwd: string): TurnParser {
  let session: string | null = null;
  let messageId = '';
  const streamed = new Map<string, ChatItem>();
  const tools = new Map<string, Extract<ChatItem, { kind: 'tool' }>>();
  const limits = new Map<string, PlanLimit>();
  let usedTokens = 0;
  let windowTokens = 0;

  function usage(): TurnUsage {
    const context =
      usedTokens && windowTokens ? { usedTokens, windowTokens } : null;
    return { context, limits: [...limits.values()] };
  }

  function onRateLimit(event: JsonRecord): ChatItem[] {
    for (const limit of claudeLimits(record(event.rate_limit_info)))
      limits.set(limit.label, limit);
    return [];
  }

  function streamItem(index: unknown, kind: 'assistant' | 'thinking') {
    const id = `${messageId}:${String(index)}`;
    const item = streamed.get(id) ?? { id, kind, text: '' };
    streamed.set(id, item);
    return item as Extract<ChatItem, { kind: 'assistant' | 'thinking' }>;
  }

  function onStreamEvent(event: JsonRecord): ChatItem[] {
    if (event.type === 'message_start') {
      const message = record(event.message);
      messageId = str(message.id);
      usedTokens = contextTokens(record(message.usage));
      return [];
    }
    if (event.type === 'message_delta') {
      usedTokens = contextTokens(record(event.usage)) || usedTokens;
      return [];
    }
    if (event.type !== 'content_block_delta') return [];
    const delta = record(event.delta);
    if (delta.type === 'text_delta') {
      const item = streamItem(event.index, 'assistant');
      item.text += str(delta.text);
      return [{ ...item }];
    }
    if (delta.type === 'thinking_delta' && str(delta.thinking)) {
      const item = streamItem(event.index, 'thinking');
      item.text += str(delta.thinking);
      return [{ ...item }];
    }
    return [];
  }

  function onToolUse(block: JsonRecord): ChatItem {
    const id = str(block.id);
    const name = str(block.name);
    const input = record(block.input);
    if (name === TODO_TOOL)
      return { id, kind: 'todos', todos: claudeTodos(input) };
    const item = {
      id,
      kind: 'tool' as const,
      name,
      summary: claudeToolSummary(name, input, cwd),
      detail: clip(claudeToolDetail(name, input), DETAIL_MAX_CHARS),
      output: null,
      failed: false,
    };
    tools.set(id, item);
    return item;
  }

  function onAssistant(event: JsonRecord): ChatItem[] {
    const content = record(event.message).content;
    if (!Array.isArray(content)) return [];
    return content
      .map(record)
      .filter((block) => block.type === 'tool_use')
      .map(onToolUse);
  }

  function onToolResults(event: JsonRecord): ChatItem[] {
    const content = record(event.message).content;
    if (!Array.isArray(content)) return [];
    return content.map(record).flatMap((block): ChatItem[] => {
      const tool = tools.get(str(block.tool_use_id));
      if (block.type !== 'tool_result' || !tool) return [];
      tool.output = clip(toolResultText(block.content), OUTPUT_MAX_CHARS);
      tool.failed = block.is_error === true;
      return [{ ...tool }];
    });
  }

  function onResult(event: JsonRecord): ChatItem[] {
    const ok = event.subtype === 'success' && event.is_error !== true;
    windowTokens = largestContextWindow(event.modelUsage) || windowTokens;
    return [
      {
        id: `result:${str(event.session_id) || messageId}`,
        kind: 'result',
        ok,
        text: ok ? '' : str(event.result) || str(event.subtype),
        durationMs:
          typeof event.duration_ms === 'number' ? event.duration_ms : null,
        costUsd:
          typeof event.total_cost_usd === 'number'
            ? event.total_cost_usd
            : null,
      },
    ];
  }

  return {
    sessionId: () => session,
    usage,
    feed(event) {
      if (typeof event.session_id === 'string') session = event.session_id;
      if (event.parent_tool_use_id) return [];
      switch (event.type) {
        case 'stream_event':
          return onStreamEvent(record(event.event));
        case 'assistant':
          return onAssistant(event);
        case 'user':
          return onToolResults(event);
        case 'result':
          return onResult(event);
        case 'rate_limit_event':
          return onRateLimit(event);
        default:
          return [];
      }
    },
  };
}

function codexChanges(item: JsonRecord): string {
  const changes = Array.isArray(item.changes) ? item.changes : [];
  return changes
    .map((change) => {
      const entry = record(change);
      return `${str(entry.kind)} ${str(entry.path)}`.trim();
    })
    .join('\n');
}

function codexTodos(item: JsonRecord): Todo[] {
  const items = Array.isArray(item.items) ? item.items : [];
  return items.map((todo) => {
    const entry = record(todo);
    return {
      text: str(entry.text),
      status: entry.completed === true ? 'completed' : 'pending',
    };
  });
}

function codexTool(
  id: string,
  name: string,
  summary: string,
  detail: string,
  output: string | null,
  failed: boolean,
): ChatItem {
  return { id, kind: 'tool', name, summary, detail, output, failed };
}

function codexItem(item: JsonRecord, cwd: string): ChatItem | null {
  const id = str(item.id);
  switch (item.type) {
    case 'agent_message':
      return { id, kind: 'assistant', text: str(item.text) };
    case 'reasoning':
      return str(item.text)
        ? { id, kind: 'thinking', text: str(item.text) }
        : null;
    case 'command_execution': {
      const exitCode = item.exit_code;
      return codexTool(
        id,
        'Bash',
        str(item.command).split('\n')[0],
        str(item.command),
        item.status === 'in_progress'
          ? null
          : clip(str(item.aggregated_output), OUTPUT_MAX_CHARS),
        typeof exitCode === 'number' && exitCode !== 0,
      );
    }
    case 'file_change': {
      const changes = codexChanges(item);
      const first = relative(
        cwd,
        changes.split('\n')[0]?.split(' ').at(-1) ?? '',
      );
      return codexTool(
        id,
        'Edit',
        first,
        changes,
        '',
        item.status === 'failed',
      );
    }
    case 'mcp_tool_call':
      return codexTool(
        id,
        `${str(item.server)}.${str(item.tool)}`,
        str(item.tool),
        JSON.stringify(item.arguments ?? {}, null, 2),
        item.status === 'in_progress' ? null : '',
        item.status === 'failed',
      );
    case 'web_search':
      return codexTool(
        id,
        'WebSearch',
        str(item.query),
        str(item.query),
        '',
        false,
      );
    case 'todo_list':
      return { id, kind: 'todos', todos: codexTodos(item) };
    case 'error':
      return { id, kind: 'notice', text: str(item.message) };
    default:
      return null;
  }
}

export function createCodexParser(cwd: string): TurnParser {
  let session: string | null = null;
  let turn = 0;
  return {
    sessionId: () => session,
    usage: () => null,
    feed(event) {
      switch (event.type) {
        case 'thread.started':
          session = str(event.thread_id) || session;
          return [];
        case 'item.started':
        case 'item.updated':
        case 'item.completed': {
          const item = codexItem(record(event.item), cwd);
          return item ? [item] : [];
        }
        case 'turn.completed':
          turn += 1;
          return [
            {
              id: `result:${turn}`,
              kind: 'result',
              ok: true,
              text: '',
              durationMs: null,
              costUsd: null,
            },
          ];
        case 'turn.failed':
          turn += 1;
          return [
            {
              id: `result:${turn}`,
              kind: 'result',
              ok: false,
              text: str(record(event.error).message),
              durationMs: null,
              costUsd: null,
            },
          ];
        case 'error':
          return [
            {
              id: `error:${str(event.message)}`,
              kind: 'notice',
              text: str(event.message),
            },
          ];
        default:
          return [];
      }
    },
  };
}

const QUESTION_TOOL = 'AskUserQuestion';
const USER_INPUT_TOOLS = new Set([QUESTION_TOOL, PLAN_TOOL]);

export interface ControlRequest {
  requestId: string;
  tool: string;
  input: JsonRecord;
  needsUser: boolean;
}

export function parseControlRequest(event: JsonRecord): ControlRequest | null {
  const request = record(event.request);
  if (event.type !== 'control_request' || request.subtype !== 'can_use_tool')
    return null;
  const tool = str(request.tool_name);
  return {
    requestId: str(event.request_id),
    tool,
    input: record(request.input),
    needsUser:
      request.requires_user_interaction === true || USER_INPUT_TOOLS.has(tool),
  };
}

function questionsFrom(input: JsonRecord): AgentQuestion[] {
  const questions = Array.isArray(input.questions) ? input.questions : [];
  return questions.map((entry) => {
    const question = record(entry);
    const options = Array.isArray(question.options) ? question.options : [];
    return {
      question: str(question.question),
      header: str(question.header),
      multiSelect: question.multiSelect === true,
      options: options.map((option) =>
        typeof option === 'string'
          ? { label: option, description: '' }
          : {
              label: str(record(option).label),
              description: str(record(option).description),
            },
      ),
    };
  });
}

export function permissionItem(
  id: string,
  request: ControlRequest,
  cwd: string,
): ChatItem {
  const { tool, input } = request;
  return {
    id,
    kind: 'permission',
    tool,
    summary: claudeToolSummary(tool, input, cwd),
    detail: clip(claudeToolDetail(tool, input), DETAIL_MAX_CHARS),
    questions: tool === QUESTION_TOOL ? questionsFrom(input) : null,
    plan: tool === PLAN_TOOL ? str(input.plan) : null,
    status: 'pending',
  };
}

export function controlResponse(
  requestId: string,
  response: JsonRecord,
): string {
  return JSON.stringify({
    type: 'control_response',
    response: { subtype: 'success', request_id: requestId, response },
  });
}

export function allowResponse(
  request: ControlRequest,
  answers?: Record<string, string>,
  nextMode?: string,
): JsonRecord {
  const updatedInput = answers ? { ...request.input, answers } : request.input;
  const response: JsonRecord = { behavior: 'allow', updatedInput };
  if (request.tool === PLAN_TOOL && nextMode) {
    response.updatedPermissions = [
      { type: 'setMode', mode: nextMode, destination: 'session' },
    ];
  }
  return response;
}

export function denyResponse(message: string): JsonRecord {
  return { behavior: 'deny', message };
}
