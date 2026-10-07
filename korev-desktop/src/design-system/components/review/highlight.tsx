import type { ReactNode } from 'react';

export type DiffLang = 'ts' | 'js' | 'py' | 'go';

const KEYWORDS = new Set(
  'const let var function return if else for while await async import export from new class extends try catch finally throw type interface of in null undefined true false this default switch case break continue def self None True False elif lambda pass raise with as yield public private readonly enum'.split(
    ' ',
  ),
);

const TOKEN =
  /(\/\/.*$|#(?!\w*\().*$)|('(?:\\.|[^'])*'|"(?:\\.|[^"])*"|`(?:\\.|[^`])*`)|(\b\d[\d_.]*\b)|([A-Za-z_$][\w$]*)(\s*\()?|([^\sA-Za-z_$\d'"`]+)|(\s+)/g;

function identifierClass(word: string, isCall: boolean): string | undefined {
  if (KEYWORDS.has(word)) return 'kv-syn-k';
  if (isCall) return 'kv-syn-f';
  if (/^[A-Z]/.test(word)) return 'kv-syn-t';
  return undefined;
}

export function highlightCode(source: string, lang: DiffLang): ReactNode[] {
  const tokens: ReactNode[] = [];
  let key = 0;
  const pattern = new RegExp(TOKEN.source, TOKEN.flags);
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    const [whole, comment, string, number, identifier, callParen, punctuation] =
      match;
    if (comment && comment.startsWith('#') && lang !== 'py') {
      tokens.push(
        <span key={key++} className="kv-syn-p">
          #
        </span>,
      );
      pattern.lastIndex = match.index + 1;
      continue;
    }
    if (comment) {
      tokens.push(
        <span key={key++} className="kv-syn-c">
          {comment}
        </span>,
      );
    } else if (string) {
      tokens.push(
        <span key={key++} className="kv-syn-s">
          {string}
        </span>,
      );
    } else if (number) {
      tokens.push(
        <span key={key++} className="kv-syn-n">
          {number}
        </span>,
      );
    } else if (identifier) {
      tokens.push(
        <span
          key={key++}
          className={identifierClass(identifier, Boolean(callParen))}
        >
          {identifier}
        </span>,
      );
      if (callParen) tokens.push(callParen);
    } else if (punctuation) {
      tokens.push(
        <span key={key++} className="kv-syn-p">
          {punctuation}
        </span>,
      );
    } else {
      tokens.push(whole);
    }
    if (whole === '') pattern.lastIndex++;
  }
  return tokens;
}
