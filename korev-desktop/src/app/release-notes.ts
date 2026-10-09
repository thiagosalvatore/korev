export type ReleaseSectionKind = 'new' | 'fixed';

export interface ReleaseSection {
  kind: ReleaseSectionKind;
  items: string[];
}

export interface ReleaseNotes {
  summary: string;
  sections: ReleaseSection[];
}

const SECTION_HEADING = /^###\s+(.*)$/;
const BULLET = /^[-*]\s+(.*)$/;
const FIXED_HEADING = 'fixed';
const SECTION_ORDER: ReleaseSectionKind[] = ['new', 'fixed'];

function headingKind(heading: string): ReleaseSectionKind {
  return heading.trim().toLowerCase() === FIXED_HEADING ? 'fixed' : 'new';
}

export function parseReleaseNotes(notes: string): ReleaseNotes {
  const items: Record<ReleaseSectionKind, string[]> = { new: [], fixed: [] };
  let summary = '';
  let kind: ReleaseSectionKind = 'new';
  let started = false;
  for (const rawLine of notes.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const heading = SECTION_HEADING.exec(line);
    const bullet = BULLET.exec(line);
    if (heading) {
      kind = headingKind(heading[1]);
      started = true;
    } else if (bullet) {
      items[kind].push(bullet[1]);
      started = true;
    } else if (!started) {
      summary = summary ? `${summary} ${line}` : line;
    } else if (items[kind].length > 0) {
      items[kind].push(`${items[kind].pop()} ${line}`);
    }
  }
  return {
    summary,
    sections: SECTION_ORDER.filter((each) => items[each].length > 0).map(
      (each) => ({ kind: each, items: items[each] }),
    ),
  };
}
