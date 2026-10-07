import { encode } from 'uqr';

const QUIET_ZONE_MODULES = 2;
const DEFAULT_SIZE = 224;

function modulePath(rows: boolean[][]): string {
  return rows
    .flatMap((row, y) =>
      row.map((dark, x) => (dark ? `M${x} ${y}h1v1h-1z` : '')),
    )
    .join('');
}

export function QrCode({
  value,
  label,
  size = DEFAULT_SIZE,
}: {
  value: string;
  label: string;
  size?: number;
}) {
  const qr = encode(value, { border: QUIET_ZONE_MODULES });
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${qr.size} ${qr.size}`}
      shapeRendering="crispEdges"
      className="rounded-md"
      style={{ background: 'var(--white)' }}
    >
      <path d={modulePath(qr.data)} fill="var(--gray-0)" />
    </svg>
  );
}
