import { Marked, type Token } from 'marked';
import { useMemo, type MouseEvent } from 'react';
import { cn } from '../../design-system';
import { imageType } from '../../shared/format';
import { isPrUrl, splitPrRefs } from '../../shared/pr-links';
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

interface FileRef {
  file: string;
  line: number | null;
}

type OpenFile = (file: string, line: number | null) => void;
type OpenImage = (file: string) => void;

const LINE_SUFFIX = String.raw`(?::(\d+)(?::\d+)?)?`;
const PATH_SEGMENT = String.raw`[\w.@+-]+`;
const FILE_REF = new RegExp(
  String.raw`^((?:~|\.{1,2})?\/?(?:${PATH_SEGMENT}\/)*${PATH_SEGMENT})${LINE_SUFFIX}$`,
);
const SHORT_EXTENSION = /\.[a-z][a-z0-9]{0,4}$/;
const BARE_PATH = new RegExp(
  String.raw`(^|[\s(;])(~?(?:\/${PATH_SEGMENT})+\.[A-Za-z][A-Za-z0-9]*)${LINE_SUFFIX}`,
  'g',
);

function parseFileRef(text: string): FileRef | null {
  const match = FILE_REF.exec(text);
  if (!match) return null;
  const [, file, line] = match;
  if (!file.includes('/') && !SHORT_EXTENSION.test(file)) return null;
  return { file, line: line ? Number(line) : null };
}

function fileLink({ file, line }: FileRef, label: string): string {
  const lineAttribute = line ? ` data-line="${line}"` : '';
  return `<a href="${escapeHtml(file)}" data-file="${escapeHtml(file)}"${lineAttribute}>${label}</a>`;
}

function linkBarePaths(escapedText: string): string {
  return escapedText.replace(
    BARE_PATH,
    (whole, before: string, file: string, line?: string) =>
      `${before}${fileLink({ file, line: line ? Number(line) : null }, whole.slice(before.length))}`,
  );
}

const markdownOptions = {
  gfm: true,
  breaks: false,
  renderer: {
    html: ({ text }: { text: string }) => escapeHtml(text),
  },
};

const markdown = new Marked(markdownOptions);

function linkPrRefs(escapedText: string, repoUrl: string | null): string {
  return splitPrRefs(escapedText, repoUrl)
    .map((part) =>
      typeof part === 'string'
        ? part
        : `<a href="${escapeHtml(part.url)}">${part.label}</a>`,
    )
    .join('');
}

const linkLabels = new WeakSet<Token>();

function markInnerTokens(token: Token) {
  if (!('tokens' in token)) return;
  for (const inner of token.tokens ?? []) {
    linkLabels.add(inner);
    markInnerTokens(inner);
  }
}

function createLinkingMarkdown(repoUrl: string | null): Marked {
  return new Marked(markdownOptions, {
    walkTokens(token) {
      if (token.type === 'link') markInnerTokens(token);
    },
    renderer: {
      codespan({ text }) {
        const code = `<code>${escapeHtml(text)}</code>`;
        if (isPrUrl(text)) return `<a href="${escapeHtml(text)}">${code}</a>`;
        const ref = parseFileRef(text);
        return ref ? fileLink(ref, code) : false;
      },
      link({ href, tokens }) {
        const ref = parseFileRef(href);
        return ref ? fileLink(ref, this.parser.parseInline(tokens)) : false;
      },
      text(token) {
        if ('tokens' in token && token.tokens) return false;
        const escaped =
          'escaped' in token && token.escaped
            ? token.text
            : escapeHtml(token.text);
        if (linkLabels.has(token)) return escaped;
        return linkPrRefs(linkBarePaths(escaped), repoUrl);
      },
    },
  });
}

const linkingMarkdownByRepo = new Map<string | null, Marked>();

function linkingMarkdown(repoUrl: string | null): Marked {
  const cached = linkingMarkdownByRepo.get(repoUrl);
  if (cached) return cached;
  const instance = createLinkingMarkdown(repoUrl);
  linkingMarkdownByRepo.set(repoUrl, instance);
  return instance;
}

export function renderMarkdown(
  text: string,
  linkFiles = false,
  repoUrl: string | null = null,
): string {
  return (linkFiles ? linkingMarkdown(repoUrl) : markdown).parse(text, {
    async: false,
  });
}

function openLinks(
  event: MouseEvent<HTMLDivElement>,
  onOpenFile?: OpenFile,
  onOpenImage?: OpenImage,
) {
  const anchor = (event.target as HTMLElement).closest('a');
  if (!anchor) return;
  event.preventDefault();
  const file = anchor.dataset.file;
  if (file && onOpenImage && imageType(file)) {
    onOpenImage(file);
    return;
  }
  if (file && onOpenFile) {
    onOpenFile(file, Number(anchor.dataset.line) || null);
    return;
  }
  const href = anchor.getAttribute('href');
  if (href) void api.openExternal(href);
}

export function Markdown({
  text,
  className,
  onOpenFile,
  onOpenImage,
  repoUrl = null,
}: {
  text: string;
  className?: string;
  onOpenFile?: OpenFile;
  onOpenImage?: OpenImage;
  repoUrl?: string | null;
}) {
  const linkFiles = Boolean(onOpenFile || onOpenImage);
  const html = useMemo(
    () => renderMarkdown(text, linkFiles, repoUrl),
    [text, linkFiles, repoUrl],
  );
  return (
    <div
      className={cn('kv-md', className)}
      onClick={(event) => openLinks(event, onOpenFile, onOpenImage)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
