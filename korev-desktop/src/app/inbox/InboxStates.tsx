import type { ReactNode } from 'react';
import { Button, EmptyState, Skeleton } from '../../design-system';
import { pluralize } from '../format';
import { refreshInbox } from '../useInboxSnapshot';

const FALLBACK_ERROR = 'Korev could not reach GitHub.';

export interface LoadErrorProps {
  title: string;
  message: string | null;
}

export function LoadError({ title, message }: LoadErrorProps) {
  return (
    <EmptyState
      icon="octagon-alert"
      title={title}
      description={message ?? FALLBACK_ERROR}
      action={
        <Button icon="refresh-cw" onClick={() => void refreshInbox()}>
          Retry
        </Button>
      }
    />
  );
}

function SkeletonRow() {
  return (
    <div className="grid min-h-13 grid-cols-[16px_minmax(240px,1fr)_auto] items-center gap-3 px-5 py-2">
      <Skeleton className="size-3.5 rounded-full" />
      <span className="flex flex-col gap-1.5">
        <Skeleton className="w-2/3" />
        <Skeleton className="h-2.5 w-1/3" />
      </span>
      <Skeleton className="h-5 w-16" />
    </div>
  );
}

export interface FilteredOutProps {
  title: string;
  hiddenCount: number;
  noun: string;
  onShowAll: () => void;
}

export function FilteredOut({
  title,
  hiddenCount,
  noun,
  onShowAll,
}: FilteredOutProps) {
  const verb = hiddenCount === 1 ? 'is' : 'are';
  return (
    <EmptyState
      icon="funnel"
      title={title}
      description={`${pluralize(hiddenCount, noun)} ${verb} in other repos.`}
      action={
        <Button variant="primary" onClick={onShowAll}>
          Show all repos
        </Button>
      }
    />
  );
}

export function SkeletonRows({ count }: { count: number }) {
  return Array.from({ length: count }, (_, index) => (
    <SkeletonRow key={index} />
  ));
}

const SECTION_SKELETON_ROWS = [3, 2];

export function SectionSkeletons() {
  return SECTION_SKELETON_ROWS.map((rows, index) => (
    <div key={index}>
      <div className="flex h-9 items-center gap-2 border-b border-border-1 px-5">
        <Skeleton className="h-2.5 w-20" />
        <Skeleton className="h-2.5 w-4" />
      </div>
      <SkeletonRows count={rows} />
    </div>
  ));
}

export function LoadingList({ children }: { children: ReactNode }) {
  return (
    <div aria-busy="true" aria-label="Loading pull requests" className="pb-6">
      {children}
    </div>
  );
}
