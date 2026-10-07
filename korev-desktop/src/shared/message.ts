const ATTACHMENTS_HEADER = 'Attached files (read them):';
export const TAB_CONTEXT_HEADER = 'Context from other tabs:';
const PLAN_PATTERN = /<plan(?: from="([^"]*)")?>\n([\s\S]*?)\n<\/plan>/g;
const HEADING_PATTERN = /^#{1,6}\s+(.+)$/m;
const LIST_ITEM_PREFIX = '- ';
const DEFAULT_PLAN_NAME = 'plan';
const MAX_NAME_LENGTH = 60;
const EMPTY_TAB_CONTEXT = new RegExp(`\\n*${TAB_CONTEXT_HEADER}\\s*$`);

export interface MessagePlan {
  name: string;
  from: string | null;
  markdown: string;
}

export interface MessageParts {
  body: string;
  plans: MessagePlan[];
  files: string[];
}

export function planBlock(plan: string, from?: string): string {
  const source = from ? ` from="${from.replaceAll('"', "'")}"` : '';
  return `<plan${source}>\n${plan}\n</plan>`;
}

export function formatAttachments(paths: string[]): string {
  if (!paths.length) return '';
  return `\n\n${ATTACHMENTS_HEADER}\n${paths.map((file) => LIST_ITEM_PREFIX + file).join('\n')}`;
}

export function planFileName(markdown: string): string {
  const heading = HEADING_PATTERN.exec(markdown)?.[1] ?? '';
  const slug = heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, MAX_NAME_LENGTH)
    .replace(/^-+|-+$/g, '');
  return `${slug || DEFAULT_PLAN_NAME}.md`;
}

function splitAttachments(text: string): { rest: string; files: string[] } {
  const start = text.indexOf(`\n${ATTACHMENTS_HEADER}\n`);
  if (start === -1) return { rest: text, files: [] };
  const lines = text.slice(start + ATTACHMENTS_HEADER.length + 2).split('\n');
  const count = lines.findIndex((line) => !line.startsWith(LIST_ITEM_PREFIX));
  const listed = count === -1 ? lines : lines.slice(0, count);
  const after = count === -1 ? [] : lines.slice(count);
  return {
    rest: `${text.slice(0, start)}\n${after.join('\n')}`,
    files: listed.map((line) => line.slice(LIST_ITEM_PREFIX.length)),
  };
}

export function messageParts(text: string): MessageParts {
  const plans = Array.from(
    text.matchAll(PLAN_PATTERN),
    ([, from, markdown]) => ({
      name: planFileName(markdown),
      from: from ?? null,
      markdown,
    }),
  );
  const { rest, files } = splitAttachments(text.replace(PLAN_PATTERN, ''));
  const body = rest
    .replace(EMPTY_TAB_CONTEXT, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { body, plans, files };
}
