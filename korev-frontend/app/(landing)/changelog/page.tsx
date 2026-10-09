import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Sparkles, Tag, Wrench, type LucideIcon } from 'lucide-react';
import { Footer, Nav } from '@/components/landing/Chrome';
import { MacDownloadButton } from '@/components/landing/MacDownload';
import {
  loadChangelog,
  type Release,
  type ReleaseSection,
  type SectionKind,
} from '@/lib/changelog';

export const metadata: Metadata = {
  title: 'Changelog · Korev',
  description: 'Every Korev release, newest first: new features and fixes.',
};

const SECTION_LOOKS: Record<SectionKind, { label: string; icon: LucideIcon }> =
  {
    new: { label: 'New', icon: Sparkles },
    fixed: { label: 'Fixed', icon: Wrench },
  };

const INLINE_MARKUP = /(\*\*[^*]+\*\*|`[^`]+`)/;

function renderInline(text: string): ReactNode[] {
  return text.split(INLINE_MARKUP).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={index}>{part.slice(1, -1)}</code>;
    return part;
  });
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function anchorFor(release: Release): string {
  return `v${release.version}`;
}

function Section({ section }: { section: ReleaseSection }) {
  const { label, icon: Icon } = SECTION_LOOKS[section.kind];
  return (
    <section className={`cl-sec cl-${section.kind}`}>
      <h3>
        <Icon size={13} />
        {label}
      </h3>
      <ul>
        {section.items.map((item) => (
          <li key={item}>{renderInline(item)}</li>
        ))}
      </ul>
    </section>
  );
}

function ReleaseEntry({ release }: { release: Release }) {
  const anchor = anchorFor(release);
  return (
    <li id={anchor} className="cl-rel">
      <div className="cl-meta">
        <a href={`#${anchor}`} className="cl-tag">
          {anchor}
        </a>
        <time dateTime={release.date}>{formatDate(release.date)}</time>
      </div>
      <div className="cl-body">
        <h2>{renderInline(release.summary)}</h2>
        {release.sections.map((section) => (
          <Section key={section.kind} section={section} />
        ))}
      </div>
    </li>
  );
}

export default function Changelog() {
  const releases = loadChangelog();
  const [latest] = releases;
  return (
    <div className="lp">
      <Nav />
      <div className="lp-wrap">
        <header className="cl-hero">
          <div className="cmd">
            <Tag size={14} />
            <b>{anchorFor(latest)}</b> · latest release ·{' '}
            {formatDate(latest.date)}
          </div>
          <h1>Changelog</h1>
          <p>Every Korev release, newest first.</p>
          <MacDownloadButton size="lg">Download for Mac</MacDownloadButton>
        </header>
        <ol className="cl-log">
          {releases.map((release) => (
            <ReleaseEntry key={release.version} release={release} />
          ))}
        </ol>
      </div>
      <Footer />
    </div>
  );
}
