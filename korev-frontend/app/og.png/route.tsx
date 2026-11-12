import { ImageResponse } from 'next/og';
import { SOCIAL_IMAGE } from '@/lib/site-metadata';

export const dynamic = 'force-static';

const BACKGROUND = '#0b0d10';
const FOREGROUND = '#F5F6F8';
const MUTED = '#a2aab8';
const ACCENT = '#4A72FF';
const MARK_SIZE = 120;

export function GET() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: 96,
        background: BACKGROUND,
        color: FOREGROUND,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
        <svg
          width={MARK_SIZE}
          height={MARK_SIZE}
          viewBox="0 0 32 32"
          fill="none"
        >
          <rect
            x="5"
            y="4"
            width="4.5"
            height="24"
            rx="1.2"
            fill={FOREGROUND}
          />
          <path
            d="M25 5.5 15 16l10 10.5"
            stroke={ACCENT}
            strokeWidth="4.5"
            strokeLinecap="square"
          />
        </svg>
        <div
          style={{ fontSize: 120, fontWeight: 600, letterSpacing: '-0.035em' }}
        >
          korev
        </div>
      </div>
      <div style={{ marginTop: 56, fontSize: 60, fontWeight: 600 }}>
        Every task on its own branch
      </div>
      <div style={{ marginTop: 24, fontSize: 34, color: MUTED }}>
        Claude Code and Codex in parallel on your Mac.
      </div>
    </div>,
    { width: SOCIAL_IMAGE.width, height: SOCIAL_IMAGE.height },
  );
}
