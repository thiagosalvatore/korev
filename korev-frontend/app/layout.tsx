import type { Metadata } from 'next';
import { Fragment_Mono, Onest } from 'next/font/google';
import { THEME_STORAGE_KEY } from '@/components/landing/theme';
import './globals.css';

const onest = Onest({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-onest',
});

const fragmentMono = Fragment_Mono({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-fragment-mono',
});

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
      className={`${onest.variable} ${fragmentMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPLY_STORED_THEME }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
