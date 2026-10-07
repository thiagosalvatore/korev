import type { ReactNode } from 'react';

export interface DiffLine {
  type: 'hunk' | 'ctx' | 'add' | 'del';
  code: string;
}

const KEYWORDS = new Set(
  'const let var function return if else for while await async import export from new class extends try catch finally throw type interface of in null undefined true false this default switch case break continue public private readonly enum'.split(
    ' ',
  ),
);
const TOKEN =
  /(\/\/.*$)|('(?:\\.|[^'])*'|"(?:\\.|[^"])*"|`(?:\\.|[^`])*`)|(\b\d[\d_.]*\b)|([A-Za-z_$][\w$]*)(\s*\()?|([^\sA-Za-z_$\d'"`]+)|(\s+)/g;
const HUNK_HEADER = /-(\d+)(?:,\d+)? \+(\d+)/;

function wordClass(word: string, isCall: boolean) {
  if (KEYWORDS.has(word)) return 'kv-syn-k';
  if (isCall) return 'kv-syn-f';
  if (/^[A-Z]/.test(word)) return 'kv-syn-t';
  return undefined;
}

function literalClass(comment?: string, str?: string, num?: string) {
  if (comment) return 'kv-syn-c';
  if (str) return 'kv-syn-s';
  if (num) return 'kv-syn-n';
  return 'kv-syn-p';
}

function highlight(src: string): ReactNode[] {
  return [...src.matchAll(TOKEN)].flatMap((m, key) => {
    const [text, comment, str, num, word, call, , space] = m;
    if (space) return [text];
    if (word)
      return [
        <span key={key} className={wordClass(word, !!call)}>
          {word}
        </span>,
        call ?? '',
      ];
    return [
      <span key={key} className={literalClass(comment, str, num)}>
        {text}
      </span>,
    ];
  });
}

const SIGN: Record<DiffLine['type'], string> = {
  add: '+',
  del: '−',
  ctx: ' ',
  hunk: '',
};

export function DiffHunk({
  lines,
  notes = {},
  oldStart = 1,
  newStart = 1,
}: {
  lines: DiffLine[];
  notes?: Record<number, ReactNode>;
  oldStart?: number;
  newStart?: number;
}) {
  let oldLine = oldStart;
  let newLine = newStart;
  const rows: ReactNode[] = [];
  lines.forEach((line, idx) => {
    if (line.type === 'hunk') {
      const header = HUNK_HEADER.exec(line.code);
      if (header) {
        oldLine = +header[1];
        newLine = +header[2];
      }
      rows.push(
        <tr key={idx} className="kv-diff__row--hunk">
          <td className="kv-diff__num" />
          <td className="kv-diff__num" />
          <td colSpan={2} style={{ paddingLeft: 8 }}>
            {line.code}
          </td>
        </tr>,
      );
    } else {
      const oldNum = line.type === 'add' ? '' : oldLine++;
      const newNum = line.type === 'del' ? '' : newLine++;
      const rowClass =
        line.type === 'ctx' ? undefined : `kv-diff__row--${line.type}`;
      rows.push(
        <tr key={idx} className={rowClass}>
          <td className="kv-diff__num">{oldNum}</td>
          <td className="kv-diff__num">{newNum}</td>
          <td className="kv-diff__sign">{SIGN[line.type]}</td>
          <td className="kv-diff__code">{highlight(line.code)}</td>
        </tr>,
      );
    }
    if (notes[idx])
      rows.push(
        <tr key={`n${idx}`} className="kv-diff__note">
          <td colSpan={4}>{notes[idx]}</td>
        </tr>,
      );
  });
  return (
    <div className="kv-diff">
      <table>
        <colgroup>
          <col style={{ width: 44 }} />
          <col style={{ width: 44 }} />
          <col style={{ width: 18 }} />
          <col />
        </colgroup>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}
