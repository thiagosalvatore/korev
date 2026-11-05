import { cn } from '../../cn';

export interface LoadingRingProps {
  size?: number;
  className?: string;
}

export function LoadingRing({ size = 16, className }: LoadingRingProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn(
        'block flex-none animate-spin motion-reduce:[animation-duration:3s]',
        className,
      )}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2.5"
        opacity="0.2"
      />
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        pathLength="100"
        strokeDasharray="30 150"
        className="animate-arc motion-reduce:animate-none"
      />
    </svg>
  );
}
