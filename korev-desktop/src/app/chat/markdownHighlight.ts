import { escapeHtml } from './Markdown';

const FENCE = /^\s*```/;
const HEADING = /^(#{1,6} )(.*)$/;
const BLOCK_MARKER = /^(\s*)((?:[-*+]|\d+\.)(?= )|>)(.*)$/;
const INLINE =
  /`(?<code>[^`\n]+)`|\*\*(?<bold>[^*\n]+)\*\*|\*(?<starItalic>[^*\s](?:[^*\n]*[^*\s])?)\*|\b_(?<underscoreItalic>[^_\n]+)_\b|\[(?<label>[^\]\n]+)\]\((?<url>[^)\n]+)\)/g;

function span(className: string, html: string): string {
  return `<span class="${className}">${html}</span>`;
}

function marker(text: string): string {
  return span('md-marker', escapeHtml(text));
}

function wrap(open: string, inner: string, close: string, className: string) {
  return marker(open) + span(className, escapeHtml(inner)) + marker(close);
}

function highlightToken(groups: Record<string, string | undefined>): string {
  const { code, bold, starItalic, underscoreItalic, label, url } = groups;
  if (code !== undefined) return wrap('`', code, '`', 'md-code');
  if (bold !== undefined) return wrap('**', bold, '**', 'md-bold');
  if (starItalic !== undefined) return wrap('*', starItalic, '*', 'md-italic');
  if (underscoreItalic !== undefined)
    return wrap('_', underscoreItalic, '_', 'md-italic');
  return wrap('[', label ?? '', `](${url})`, 'md-link');
}

function highlightInline(line: string): string {
  let html = '';
  let last = 0;
  for (const match of line.matchAll(INLINE)) {
    html += escapeHtml(line.slice(last, match.index));
    html += highlightToken(match.groups ?? {});
    last = match.index + match[0].length;
  }
  return html + escapeHtml(line.slice(last));
}

function highlightLine(line: string): string {
  const heading = HEADING.exec(line);
  if (heading)
    return marker(heading[1]) + span('md-heading', highlightInline(heading[2]));
  const block = BLOCK_MARKER.exec(line);
  if (block)
    return escapeHtml(block[1]) + marker(block[2]) + highlightInline(block[3]);
  return highlightInline(line);
}

export function highlightMarkdown(text: string): string {
  let inFence = false;
  const lines = text.split('\n').map((line) => {
    if (FENCE.test(line)) {
      inFence = !inFence;
      return span('md-code', marker(line));
    }
    return inFence ? span('md-code', escapeHtml(line)) : highlightLine(line);
  });
  return lines.join('\n') + (text.endsWith('\n') ? ' ' : '');
}
