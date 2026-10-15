import type { ReactNode } from 'react';
import { cn, IconButton } from '../design-system';
import { DRAG_REGION, NO_DRAG, TRAFFIC_LIGHT_GUTTER } from './layout';
import { setUi, useUi } from './ui-store';

export function PageHeader({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  const sidebar = useUi((ui) => ui.sidebar);
  return (
    <header
      className={cn(
        'flex h-11 flex-none items-center gap-2 border-b border-border-1 bg-app pr-2',
        DRAG_REGION,
        sidebar ? 'pl-3' : TRAFFIC_LIGHT_GUTTER,
      )}
    >
      {sidebar ? null : (
        <IconButton
          icon="panel-left"
          label="Show sidebar"
          size="sm"
          className={NO_DRAG}
          onClick={() => setUi({ sidebar: true })}
        />
      )}
      <span className="flex-1 text-sm font-semibold text-fg-1">{title}</span>
      {children}
    </header>
  );
}
