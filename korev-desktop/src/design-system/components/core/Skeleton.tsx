import type { ReactNode } from 'react';
import { cn } from '../../cn';

const ROW_WIDTHS = ['w-3/5', 'w-4/5', 'w-2/5', 'w-2/3', 'w-1/2'];

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'h-3 animate-shimmer rounded-xs bg-hover bg-linear-to-r from-hover via-active to-hover bg-size-[200%_100%] motion-reduce:animate-none',
        className,
      )}
    />
  );
}

export function SkeletonStatus({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn('flex animate-appear flex-col', className)}
    >
      {children}
    </div>
  );
}

export interface SkeletonRowsProps {
  rows: number;
  lines?: 1 | 2;
  className?: string;
}

export function SkeletonRows({
  rows,
  lines = 1,
  className,
}: SkeletonRowsProps) {
  return (
    <SkeletonStatus className={cn('gap-3', className)}>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex flex-col gap-1.5">
          <Skeleton className={ROW_WIDTHS[row % ROW_WIDTHS.length]} />
          {lines === 2 ? (
            <Skeleton
              className={cn(
                'h-2.5 opacity-60',
                ROW_WIDTHS[(row + 2) % ROW_WIDTHS.length],
              )}
            />
          ) : null}
        </div>
      ))}
    </SkeletonStatus>
  );
}
