import type { AgentAccount, AgentModel, ChatItem } from '../shared/model';
import {
  claudeTodos,
  claudeToolDetail,
  claudeToolSummary,
  clip,
  DETAIL_MAX_CHARS,
  num,
  OUTPUT_MAX_CHARS,
  parseJsonLine,
  record,
  str,
  type JsonRecord,
  type TurnParser,
} from './agent-events';
import type { TurnRequest } from './agents';

const PLAN_AGENT = 'plan';
const TOOL_CALLS_FINISH = 'tool-calls';
const TOOL_ERROR = 'error';
const TODO_TOOL = 'todowrite';

export const OPENCODE_TOOL_NAMES: Record<string, string> = {
  shell: 'Bash',
  bash: 'Bash',
  read: 'Read',
  write: 'Write',
  edit: 'Edit',
  glob: 'Glob',
  grep: 'Grep',
  webfetch: 'WebFetch',
  websearch: 'WebSearch',
  task: 'Task',
};

const CLAUDE_INPUT_FIELDS: Record<string, string> = {
  path: 'file_path',
  filePath: 'file_path',
  oldString: 'old_string',
  newString: 'new_string',
};

export function opencodeArgs(request: TurnRequest): string[] {
  const readOnly = request.planMode || request.readOnly;
  return [
    'run',
    '--format',
    'json',
    '--thinking',
    '--auto',
    ...(readOnly ? ['--agent', PLAN_AGENT] : []),
    ...(request.model ? ['--model', request.model] : []),
    ...(request.resumeId ? ['--session', request.resumeId] : []),
    ...(request.resumeId && request.fork ? ['--fork'] : []),
  ];
}

function claudeShapedInput(input: JsonRecord): JsonRecord {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      CLAUDE_INPUT_FIELDS[key] ?? key,
      value,
    ]),
  );
}

function exitCode(state: JsonRecord): number {
  return num(record(record(state.metadata).metadata).exit);
}

function toolItem(part: JsonRecord, cwd: string): ChatItem {
  const id = str(part.partID) || str(part.id);
  const state = record(part.state);
  const input = claudeShapedInput(record(state.input));
  if (part.tool === TODO_TOOL)
    return { id, kind: 'todos', todos: claudeTodos(input) };
  const name = OPENCODE_TOOL_NAMES[str(part.tool)] ?? str(part.tool);
  const failed = state.status === TOOL_ERROR || exitCode(state) !== 0;
  return {
    id,
    kind: 'tool',
    name,
    summary: claudeToolSummary(name, input, cwd),
    detail: clip(claudeToolDetail(name, input), DETAIL_MAX_CHARS),
    output: clip(str(state.output) || str(state.error), OUTPUT_MAX_CHARS),
    failed,
  };
}

function result(id: string, ok: boolean, text: string, costUsd: number | null) {
  return {
    id: `result:${id}`,
    kind: 'result' as const,
    ok,
    text,
    durationMs: null,
    costUsd,
  };
}

export function createOpencodeParser(cwd: string): TurnParser {
  let session: string | null = null;
  let costUsd = 0;

  function onPart(type: unknown, part: JsonRecord): ChatItem[] {
    const id = str(part.id);
    switch (type) {
      case 'text':
        return [{ id, kind: 'assistant', text: str(part.text) }];
      case 'reasoning':
        return str(part.text)
          ? [{ id, kind: 'thinking', text: str(part.text) }]
          : [];
      case 'tool_use':
        return [toolItem(part, cwd)];
      case 'step_finish':
        costUsd += num(part.cost);
        return part.reason === TOOL_CALLS_FINISH
          ? []
          : [result(id, true, '', costUsd)];
      default:
        return [];
    }
  }

  return {
    sessionId: () => session,
    usage: () => null,
    feed(event) {
      session = str(event.sessionID) || session;
      if (event.type !== 'error') return onPart(event.type, record(event.part));
      const error = record(event.error);
      return [
        result(str(error.type) || 'error', false, str(error.message), null),
      ];
    },
  };
}

export function parseOpencodeAccount(stdout: string): AgentAccount | null {
  const integrations = parseJsonLine(stdout);
  if (!Array.isArray(integrations)) return null;
  const names = integrations.map((entry) => str(record(entry).name));
  return {
    method: names.filter(Boolean).join(', ') || null,
    email: null,
    organization: null,
  };
}

export function parseOpencodeModels(stdout: string): AgentModel[] {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((id) => ({ id, label: id }));
}
