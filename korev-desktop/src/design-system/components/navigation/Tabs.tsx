import type { CSSProperties, ReactNode } from 'react';
import { cn } from '../../cn';
import { Icon, type IconName } from '../core/Icon';
import { Badge } from '../display/Badge';

export type TabsVariant = 'underline' | 'pill';

export interface TabItem {
  id: string;
  label: ReactNode;
  count?: number;
  icon?: IconName;
}

export interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange?: (id: string) => void;
  variant?: TabsVariant;
  className?: string;
  style?: CSSProperties;
}

const LIST: Record<TabsVariant, string> = {
  underline: 'flex items-stretch gap-0.5 border-b border-border-1',
  pill: 'inline-flex w-fit gap-0.5 rounded-sm bg-inset p-0.5 shadow-[inset_0_0_0_1px_var(--border-1)]',
};

const TAB_BASE =
  'relative inline-flex cursor-pointer items-center gap-[7px] whitespace-nowrap border-0 bg-transparent px-2.5 font-sans text-sm leading-none font-medium text-fg-3 transition-colors duration-(--dur-fast) ease-out hover:text-fg-1 aria-selected:text-fg-1';

const TAB: Record<TabsVariant, string> = {
  underline:
    'h-[38px] aria-selected:after:absolute aria-selected:after:inset-x-2 aria-selected:after:-bottom-px aria-selected:after:h-0.5 aria-selected:after:rounded-t-[2px] aria-selected:after:bg-accent',
  pill: 'h-6 rounded-[4px] text-xs aria-selected:bg-active aria-selected:shadow-inset-top',
};

export function Tabs({
  tabs,
  value,
  onChange,
  variant = 'underline',
  className,
  style,
}: TabsProps) {
  return (
    <div role="tablist" className={cn(LIST[variant], className)} style={style}>
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={selected}
            className={cn(TAB_BASE, TAB[variant])}
            onClick={() => onChange?.(tab.id)}
          >
            {tab.icon ? <Icon name={tab.icon} size={14} /> : null}
            {tab.label}
            {tab.count !== undefined ? (
              <Badge
                count
                tone={
                  selected && variant === 'underline' ? 'accent' : 'neutral'
                }
              >
                {tab.count}
              </Badge>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
