const WORDMARK_GAP_RATIO = 0.32;
const WORDMARK_FONT_RATIO = 0.98;
const WORDMARK_LIFT_RATIO = 0.04;

function LogoMark({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      style={{ flex: 'none', display: 'block' }}
    >
      <rect x="5" y="4" width="4.5" height="24" rx="1.2" fill="var(--fg-1)" />
      <path
        d="M25 5.5 15 16l10 10.5"
        stroke="var(--accent)"
        strokeWidth="4.5"
        strokeLinecap="square"
      />
    </svg>
  );
}

export function Logo({ size = 20 }: { size?: number }) {
  return (
    <span
      aria-label="Korev"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: size * WORDMARK_GAP_RATIO,
        color: 'var(--fg-1)',
      }}
    >
      <LogoMark size={size} />
      <span
        style={{
          font: `600 ${size * WORDMARK_FONT_RATIO}px/1 var(--font-sans)`,
          letterSpacing: '-0.035em',
          marginTop: -size * WORDMARK_LIFT_RATIO,
        }}
      >
        korev
      </span>
    </span>
  );
}
