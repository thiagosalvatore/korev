import { Marked } from 'marked';
import { useMemo, type MouseEvent } from 'react';
import { cn } from '../../design-system';
import { api } from '../bridge';

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

const markdown = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    html: ({ text }) => escapeHtml(text),
  },
});

export function renderMarkdown(text: string): string {
  return markdown.parse(text, { async: false });
}

function openLinksExternally(event: MouseEvent<HTMLDivElement>) {
  const anchor = (event.target as HTMLElement).closest('a');
  if (!anchor) return;
  event.preventDefault();
  const href = anchor.getAttribute('href');
  if (href) void api.openExternal(href);
}

export function Markdown({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const html = useMemo(() => renderMarkdown(text), [text]);
  return (
    <div
      className={cn('kv-md', className)}
      onClick={openLinksExternally}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
