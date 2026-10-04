import type { ReactNode } from 'react';
import { Badge } from '../../design-system';
import { OwnerAvatar, useRepoAvatar } from './OwnerAvatar';

export interface StackGroupProps {
  repo: string;
  baseRefName: string;
  summary: string;
  partial: boolean;
  children: ReactNode;
}

const CONNECTOR =
  'before:absolute before:top-6.5 before:bottom-6.5 before:left-2.5 before:w-px before:bg-border-2';

export function StackGroup({
  repo,
  baseRefName,
  summary,
  partial,
  children,
}: StackGroupProps) {
  const avatarUrl = useRepoAvatar(repo);
  return (
    <div
      role="group"
      aria-label={`Stack ${repo} → ${baseRefName}`}
      className="mx-5 my-1 overflow-hidden rounded-md border border-border-1"
    >
      <div className="flex min-w-0 items-center gap-2 border-b border-border-1 px-3 py-2 text-xs text-fg-2">
        {avatarUrl ? <OwnerAvatar src={avatarUrl} size="sm" /> : null}
        <span title={repo} className="truncate font-mono text-fg-3">
          {repo}
        </span>
        <span aria-hidden="true">·</span>
        <Badge tone="accent">Stack</Badge>
        <span className="truncate font-mono">→ {baseRefName}</span>
        <span className="flex-1" />
        <span className="truncate">{summary}</span>
        {partial ? <Badge outline>partial view</Badge> : null}
      </div>
      <div className={`relative ${CONNECTOR}`}>{children}</div>
    </div>
  );
}

export function StackLayerItem({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      {children}
      <span
        aria-hidden="true"
        className="absolute top-1/2 left-2.5 size-1.5 -translate-1/2 rounded-full bg-border-strong"
      />
    </div>
  );
}

export function byPosition<Layer extends { position: number }>(
  layers: Layer[],
): Layer[] {
  return [...layers].sort((left, right) => left.position - right.position);
}
