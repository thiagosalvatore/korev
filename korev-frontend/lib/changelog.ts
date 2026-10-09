import { readFileSync } from 'node:fs';
import path from 'node:path';

export type SectionKind = 'new' | 'fixed';

export interface ReleaseSection {
  kind: SectionKind;
  items: string[];
}

export interface Release {
  version: string;
  date: string;
  summary: string;
  sections: ReleaseSection[];
}

const CHANGELOG_PATH = path.join(process.cwd(), '..', 'CHANGELOG.md');
const RELEASE_HEADING = /^## \[([^\]]+)\] - (\d{4}-\d{2}-\d{2})$/;
const SECTION_KINDS: Record<string, SectionKind> = {
  '### New': 'new',
  '### Fixed': 'fixed',
};
const ITEM_PREFIX = '- ';

function sectionFor(release: Release, kind: SectionKind): ReleaseSection {
  const existing = release.sections.find((section) => section.kind === kind);
  if (existing) return existing;
  const section = { kind, items: [] };
  release.sections.push(section);
  return section;
}

function appendText(text: string, more: string): string {
  return text ? `${text} ${more}` : more;
}

export function parseChangelog(markdown: string): Release[] {
  const releases: Release[] = [];
  let release: Release | null = null;
  let kind: SectionKind = 'new';
  let items: string[] | null = null;

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('## ')) {
      const match = RELEASE_HEADING.exec(line);
      release = match
        ? { version: match[1], date: match[2], summary: '', sections: [] }
        : null;
      if (release) releases.push(release);
      kind = 'new';
      items = null;
      continue;
    }
    if (!release || !line) continue;
    if (line.startsWith('### ')) {
      if (!(line in SECTION_KINDS))
        throw new Error(`CHANGELOG.md: unknown section "${line}"`);
      kind = SECTION_KINDS[line];
      items = null;
      continue;
    }
    if (line.startsWith(ITEM_PREFIX)) {
      items = sectionFor(release, kind).items;
      items.push(line.slice(ITEM_PREFIX.length));
      continue;
    }
    if (items) items[items.length - 1] = appendText(items.at(-1)!, line);
    else release.summary = appendText(release.summary, line);
  }
  return releases;
}

export function loadChangelog(): Release[] {
  return parseChangelog(readFileSync(CHANGELOG_PATH, 'utf8'));
}
