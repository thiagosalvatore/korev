export interface GlossaryEntry {
  term: string;
  meaning: string;
}

export type RichSegment =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'term'; text: string; meaning: string };

const CODE_SPAN = /`([^`]+)`/;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function termPattern(glossary: GlossaryEntry[]): RegExp | null {
  const terms = glossary
    .map((entry) => entry.term.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp);
  return terms.length
    ? new RegExp(`(?<!\\w)(${terms.join('|')})(?!\\w)`, 'gi')
    : null;
}

function withTerms(
  text: string,
  pattern: RegExp | null,
  meanings: Map<string, string>,
): RichSegment[] {
  if (!pattern || !text) return text ? [{ kind: 'text', text }] : [];
  return text.split(pattern).flatMap((part, index): RichSegment[] => {
    if (!part) return [];
    const meaning = index % 2 ? meanings.get(part.toLowerCase()) : undefined;
    return meaning
      ? [{ kind: 'term', text: part, meaning }]
      : [{ kind: 'text', text: part }];
  });
}

export function richSegments(
  text: string,
  glossary: GlossaryEntry[],
): RichSegment[] {
  const pattern = termPattern(glossary);
  const meanings = new Map(
    glossary.map((entry) => [entry.term.trim().toLowerCase(), entry.meaning]),
  );
  return text
    .split(CODE_SPAN)
    .flatMap((part, index): RichSegment[] =>
      index % 2
        ? [{ kind: 'code', text: part }]
        : withTerms(part, pattern, meanings),
    );
}
