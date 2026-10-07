import type { Metadata } from 'next';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { fontVariables } from '@/app/fonts';
import { GithubMark } from '@/components/ds/GithubMark';
import { Logo } from '@/components/ds/Logo';
import { GITHUB_URL, RELEASES_URL } from '@/components/landing/links';
import { THEME_STORAGE_KEY } from '@/components/landing/theme';
import { source } from '@/lib/source';
import '../styles/docs.css';

export const metadata: Metadata = {
  title: { template: '%s · Korev docs', default: 'Korev docs' },
  description:
    'How Korev runs Claude Code and Codex in parallel, one git worktree per task.',
};

function NavTitle() {
  return (
    <span className="kd-nav-title">
      <Logo size={18} />
      <span>Docs</span>
    </span>
  );
}

export default function Layout({ children }: LayoutProps<'/docs'>) {
  return (
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <body>
        <RootProvider
          theme={{
            attribute: ['class', 'data-theme'],
            storageKey: THEME_STORAGE_KEY,
            defaultTheme: 'dark',
            enableSystem: false,
          }}
          search={{ options: { type: 'static' } }}
        >
          <DocsLayout
            tree={source.getPageTree()}
            nav={{ title: <NavTitle />, url: '/docs' }}
            links={[
              {
                type: 'icon',
                label: 'GitHub',
                text: 'GitHub',
                icon: <GithubMark />,
                url: GITHUB_URL,
                external: true,
              },
              { text: 'Download', url: RELEASES_URL, external: true },
            ]}
          >
            {children}
          </DocsLayout>
        </RootProvider>
      </body>
    </html>
  );
}
