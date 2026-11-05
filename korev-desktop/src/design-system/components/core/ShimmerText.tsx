import type { ReactNode } from 'react';
import { cn } from '../../cn';

export function ShimmerText({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'animate-shimmer bg-linear-to-r from-fg-3 from-35% via-fg-1 to-fg-3 to-65% bg-size-[200%_100%] bg-clip-text text-transparent motion-reduce:animate-none',
        className,
      )}
    >
      {children}
    </span>
  );
}
