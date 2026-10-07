import { Download as DownloadIcon } from 'lucide-react';
import { LinkButton } from '@/components/ds/Button';
import { GithubMark } from '@/components/ds/GithubMark';
import { Logo } from '@/components/ds/Logo';
import {
  DOCS_URL,
  GITHUB_URL,
  RELEASES_URL,
  ROADMAP_URL,
  SHORTCUTS_URL,
} from './links';
import { ThemeToggle } from './ThemeToggle';

export function Nav() {
  return (
    <nav className="lp-nav">
      <div className="lp-wrap">
        <a href="#" aria-label="Korev home" style={{ display: 'flex' }}>
          <Logo size={20} />
        </a>
        <div className="links">
          <a href={DOCS_URL}>Docs</a>
          <a href={GITHUB_URL}>
            <GithubMark size={15} />
            GitHub
          </a>
          <ThemeToggle />
          <LinkButton
            href={RELEASES_URL}
            size="sm"
            variant="primary"
            icon={DownloadIcon}
          >
            Download
          </LinkButton>
        </div>
      </div>
    </nav>
  );
}

export function Download({ withNote = true }: { withNote?: boolean }) {
  return (
    <div className="lp-dl">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <LinkButton
          href={RELEASES_URL}
          size="lg"
          variant="primary"
          icon={DownloadIcon}
        >
          Download for Mac
        </LinkButton>
        <LinkButton href={GITHUB_URL} size="lg" variant="secondary">
          <GithubMark size={16} />
          View source
        </LinkButton>
      </div>
      {withNote && (
        <span className="note">
          Free and open source · macOS · Needs the <code>claude</code> or{' '}
          <code>codex</code> CLI and <code>gh</code>
        </span>
      )}
    </div>
  );
}

export function Footer() {
  return (
    <footer className="lp-foot">
      <div className="lp-wrap">
        <Logo size={16} />
        <span>Open source. Built in the open.</span>
        <div className="links">
          <a href={DOCS_URL}>Docs</a>
          <a href={SHORTCUTS_URL}>Shortcuts</a>
          <a href={GITHUB_URL}>GitHub</a>
          <a href={ROADMAP_URL}>Roadmap</a>
        </div>
      </div>
    </footer>
  );
}
