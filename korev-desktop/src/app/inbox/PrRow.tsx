import type { ReactNode } from 'react';
import { cn } from '../../design-system';
import { useListOption } from './listbox';
import { RepoLabel } from './OwnerAvatar';

const ROW =
  'grid min-h-13 w-full cursor-pointer items-center gap-3 px-5 py-2 text-left font-sans text-fg-1 transition-colors duration-(--dur-fast) ease-out hover:bg-hover aria-selected:bg-raised aria-selected:shadow-[inset_2px_0_0_var(--accent)] focus-visible:relative focus-visible:shadow-focus';

export interface PrRowProps {
  optionKey: string;
  url: string;
  className?: string;
  children: ReactNode;
}

export function PrRow({ optionKey, url, className, children }: PrRowProps) {
  const option = useListOption(optionKey, { url });
  return (
    <div {...option} className={cn(ROW, className)}>
      {children}
    </div>
  );
}

export interface PrSummaryProps {
  title: string;
  meta: ReactNode;
  repo?: string;
  muted?: boolean;
}

export function PrSummary({
  title,
  meta,
  repo,
  muted = false,
}: PrSummaryProps) {
  return (
    <span className="flex min-w-0 flex-col">
      <span
        title={title}
        className={cn(
          'truncate type-ui font-medium',
          muted ? 'text-fg-3' : 'text-fg-1',
        )}
      >
        {title}
      </span>
      <span className="mt-0.5 inline-flex min-w-0 items-center text-xs whitespace-nowrap text-fg-3">
        {repo ? (
          <>
            <RepoLabel repo={repo} />
            <span className="shrink-0">&nbsp;·&nbsp;</span>
          </>
        ) : null}
        <span className="truncate">{meta}</span>
      </span>
    </span>
  );
}

export interface StackPlace {
  position: number;
  size: number;
}

export function LayerLabel({ position, size }: StackPlace) {
  return (
    <span className="font-mono text-2xs whitespace-nowrap text-fg-3">
      {position} of {size}
    </span>
  );
}

export { prRef } from '../../shared/pr-ref';

export function authorHandle(login: string | null): string | null {
  return login ? `@${login}` : null;
}
