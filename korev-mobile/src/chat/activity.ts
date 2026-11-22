import { fileName } from '../../../korev-desktop/src/shared/format';
import {
  isSubagentTool,
  type ChatItem,
  type Todo,
} from '../../../korev-desktop/src/shared/model';

type ItemOf<K extends ChatItem['kind']> = Extract<ChatItem, { kind: K }>;
export type ToolItem = ItemOf<'tool'>;

export interface ActivityRow {
  kind: 'activity';
  id: string;
  tools: ToolItem[];
  thinking: string[];
  todos: Todo[] | null;
}

export type TranscriptRow = { kind: 'item'; item: ChatItem } | ActivityRow;

type ToolCategory = 'explore' | 'edit' | 'run' | 'other';

const TOOL_CATEGORIES: Record<string, ToolCategory> = {
  Read: 'explore',
  Grep: 'explore',
  Glob: 'explore',
  LS: 'explore',
  WebFetch: 'explore',
  WebSearch: 'explore',
  Edit: 'edit',
  MultiEdit: 'edit',
  Write: 'edit',
  NotebookEdit: 'edit',
  Bash: 'run',
};

const CATEGORY_ORDER: ToolCategory[] = ['explore', 'edit', 'run', 'other'];

const DISTINCT_TARGETS: ReadonlySet<ToolCategory> = new Set([
  'explore',
  'edit',
]);

const CATEGORY_WORDS: Record<ToolCategory, [string, string, string]> = {
  explore: ['explored', 'file', 'files'],
  edit: ['edited', 'file', 'files'],
  run: ['ran', 'command', 'commands'],
  other: ['used', 'tool', 'tools'],
};

const PROGRESS_VERBS: Record<string, string> = {
  Read: 'Reading',
  Grep: 'Searching',
  Glob: 'Searching',
  LS: 'Listing',
  WebFetch: 'Fetching',
  WebSearch: 'Searching the web for',
  Edit: 'Editing',
  MultiEdit: 'Editing',
  Write: 'Writing',
  NotebookEdit: 'Editing',
  Bash: 'Running',
};

const FILE_TOOLS: ReadonlySet<string> = new Set([
  'Read',
  'Edit',
  'MultiEdit',
  'Write',
  'NotebookEdit',
]);

const ACTIVITY_KINDS: ReadonlySet<ChatItem['kind']> = new Set([
  'tool',
  'thinking',
  'todos',
]);

function addToRun(run: ActivityRow, item: ChatItem) {
  if (item.kind === 'tool') run.tools.push(item);
  if (item.kind === 'thinking') run.thinking.push(item.text);
  if (item.kind === 'todos') run.todos = item.todos;
}

export function foldActivity(items: ChatItem[]): TranscriptRow[] {
  const rows: TranscriptRow[] = [];
  for (const item of items) {
    if (isSubagentTool(item)) continue;
    if (!ACTIVITY_KINDS.has(item.kind)) {
      rows.push({ kind: 'item', item });
      continue;
    }
    const last = rows.at(-1);
    const run: ActivityRow =
      last?.kind === 'activity'
        ? last
        : {
            kind: 'activity',
            id: item.id,
            tools: [],
            thinking: [],
            todos: null,
          };
    if (run !== last) rows.push(run);
    addToRun(run, item);
  }
  return rows;
}

function category(tool: ToolItem): ToolCategory {
  return TOOL_CATEGORIES[tool.name] ?? 'other';
}

function categoryCount(tools: ToolItem[], kind: ToolCategory): number {
  const matching = tools.filter((tool) => category(tool) === kind);
  if (!DISTINCT_TARGETS.has(kind)) return matching.length;
  return new Set(matching.map((tool) => tool.summary)).size;
}

function countPhrase(kind: ToolCategory, count: number): string {
  const [verb, one, many] = CATEGORY_WORDS[kind];
  return `${verb} ${count} ${count === 1 ? one : many}`;
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function progressLabel(tool: ToolItem): string {
  const verb = PROGRESS_VERBS[tool.name] ?? `Using ${tool.name}`;
  const target = FILE_TOOLS.has(tool.name)
    ? fileName(tool.summary)
    : tool.summary;
  return target ? `${verb} ${target}` : verb;
}

export function activityLabel(run: ActivityRow, running: boolean): string {
  const current = run.tools.at(-1);
  if (running) return current ? progressLabel(current) : 'Thinking';
  const phrases = CATEGORY_ORDER.map((kind) => ({
    kind,
    count: categoryCount(run.tools, kind),
  }))
    .filter(({ count }) => count > 0)
    .map(({ kind, count }) => countPhrase(kind, count));
  return phrases.length ? capitalized(phrases.join(', ')) : 'Thought';
}
