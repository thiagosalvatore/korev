import { LinkButton } from '@/components/ds/Button';
import { GithubMark } from '@/components/ds/GithubMark';
import { Logo } from '@/components/ds/Logo';
import {
  CHANGELOG_URL,
  DOCS_URL,
  GITHUB_URL,
  ROADMAP_URL,
  SHORTCUTS_URL,
} from './links';
import { MacDownloadButton, OtherMacDownload } from './MacDownload';
import { ThemeToggle } from './ThemeToggle';

export function Nav() {
  return (
    <nav className="lp-nav">
      <div className="lp-wrap">
        <a href="/" aria-label="Korev home" style={{ display: 'flex' }}>
          <Logo size={20} />
        </a>
        <div className="links">
          <a href={DOCS_URL}>Docs</a>
          <a href={CHANGELOG_URL} className="wide-only">
            Changelog
          </a>
          <a href={GITHUB_URL}>
            <GithubMark size={15} />
            GitHub
          </a>
          <ThemeToggle />
          <MacDownloadButton size="sm">Download</MacDownloadButton>
        </div>
      </div>
    </nav>
  );
}

export function Download({ withNote = true }: { withNote?: boolean }) {
  return (
    <div className="lp-dl">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <MacDownloadButton size="lg">Download for Mac</MacDownloadButton>
        <LinkButton href={GITHUB_URL} size="lg" variant="secondary">
          <GithubMark size={16} />
          View source
        </LinkButton>
      </div>
      <OtherMacDownload />
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
          <a href={CHANGELOG_URL}>Changelog</a>
          <a href={GITHUB_URL}>GitHub</a>
          <a href={ROADMAP_URL}>Roadmap</a>
        </div>
      </div>
    </footer>
  );
}
