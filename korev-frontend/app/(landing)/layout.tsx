import type { Metadata } from 'next';
import { fontVariables } from '@/app/fonts';
import { THEME_STORAGE_KEY } from '@/components/landing/theme';
import './globals.css';

const APPLY_STORED_THEME = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t)document.documentElement.dataset.theme=t}catch(e){}})()`;

export const metadata: Metadata = {
  title: 'Korev · Every task on its own branch',
  description:
    'Korev runs Claude Code and Codex in parallel on your Mac. Each task gets a git worktree with its own chats, terminal, diff and pull request.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={fontVariables}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPLY_STORED_THEME }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
