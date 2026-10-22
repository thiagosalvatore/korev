import { Marked, Renderer, type Token, type Tokens } from 'marked';
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

export function escapeHtml(text: string): string {
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
const EXPLICIT_PATH = /^(?:~|\.{1,2})?\//;
const BARE_PATH = new RegExp(
  String.raw`(^|[\s(;])(~?(?:\/${PATH_SEGMENT})+\.[A-Za-z][A-Za-z0-9]*)${LINE_SUFFIX}`,
  'g',
);

function parseFileRef(text: string): FileRef | null {
  const match = FILE_REF.exec(text);
  if (!match) return null;
  const [, file, line] = match;
  if (!SHORT_EXTENSION.test(file) && !EXPLICIT_PATH.test(file)) return null;
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

const ICON_ATTRIBUTES =
  'width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
const COPY_CODE_BUTTON = `<button type="button" class="kv-md-copy" title="Copy code" aria-label="Copy code"><svg class="kv-md-copy-icon" ${ICON_ATTRIBUTES}><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg><svg class="kv-md-copied-icon" ${ICON_ATTRIBUTES}><path d="M20 6 9 17l-5-5"/></svg></button>`;
const COPIED_MS = 1500;

const plainRenderer = new Renderer();
const copyableCode = {
  renderer: {
    code: (token: Tokens.Code) =>
      `<div class="kv-md-code">${plainRenderer.code(token)}${COPY_CODE_BUTTON}</div>`,
  },
};

// The clipboard copy renders without the code block buttons.
const plainMarkdown = new Marked(markdownOptions);
const markdown = new Marked(markdownOptions, copyableCode);

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
  return new Marked(markdownOptions, copyableCode, {
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
  breaks = false,
): string {
  return (linkFiles ? linkingMarkdown(repoUrl) : markdown).parse(text, {
    async: false,
    breaks,
  });
}

export function staticMarkdown(text: string, breaks = false): string {
  return plainMarkdown.parse(text, { async: false, breaks });
}

export function copyMarkdown(text: string): Promise<void> {
  return navigator.clipboard.write([
    new ClipboardItem({
      'text/plain': new Blob([text], { type: 'text/plain' }),
      'text/html': new Blob([staticMarkdown(text)], {
        type: 'text/html',
      }),
    }),
  ]);
}

function copyCode(button: HTMLElement) {
  const code = button.closest('.kv-md-code')?.querySelector('code');
  if (!code) return;
  void navigator.clipboard.writeText(code.textContent ?? '').then(() => {
    button.dataset.copied = '';
    setTimeout(() => delete button.dataset.copied, COPIED_MS);
  });
}

function handleClick(
  event: MouseEvent<HTMLDivElement>,
  onOpenFile?: OpenFile,
  onOpenImage?: OpenImage,
) {
  const copyButton = (event.target as HTMLElement).closest<HTMLElement>(
    '.kv-md-copy',
  );
  if (copyButton) {
    copyCode(copyButton);
    return;
  }
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
  breaks = false,
}: {
  text: string;
  className?: string;
  onOpenFile?: OpenFile;
  onOpenImage?: OpenImage;
  repoUrl?: string | null;
  breaks?: boolean;
}) {
  const linkFiles = Boolean(onOpenFile || onOpenImage);
  const html = useMemo(
    () => renderMarkdown(text, linkFiles, repoUrl, breaks),
    [text, linkFiles, repoUrl, breaks],
  );
  return (
    <div
      className={cn('kv-md', className)}
      onClick={(event) => handleClick(event, onOpenFile, onOpenImage)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
