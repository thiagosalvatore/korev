import type { ReactNode } from 'react';
import { Badge, Icon } from '../../design-system';
import { pluralize } from '../format';
import { useListOption } from './listbox';

export type CountTone = 'danger' | 'success' | 'neutral';

const HEADER =
  'sticky top-0 z-5 flex h-9 w-full items-center gap-2 border-b border-border-1 bg-app px-5 text-left type-overline text-fg-3';

const TOGGLE =
  'cursor-pointer hover:bg-hover aria-selected:bg-raised focus-visible:shadow-focus';

export interface GroupToggle {
  optionKey: string;
  expanded: boolean;
  onToggle: () => void;
}

export interface GroupHeaderProps {
  label: string;
  count: number;
  tone: CountTone;
  toggle?: GroupToggle;
}

function GroupCount({ count, tone }: { count: number; tone: CountTone }) {
  if (tone === 'neutral') {
    return <span className="font-mono text-fg-2">{count}</span>;
  }
  return (
    <Badge tone={tone} count>
      {count}
    </Badge>
  );
}

function accessibleName(label: string, count: number): string {
  return `${label}, ${pluralize(count, 'pull request')}`;
}

function ToggleHeader({
  label,
  toggle,
  children,
}: {
  label: string;
  toggle: GroupToggle;
  children: ReactNode;
}) {
  const option = useListOption(toggle.optionKey, {
    onActivate: toggle.onToggle,
  });
  return (
    <div
      {...option}
      aria-label={label}
      aria-expanded={toggle.expanded}
      className={`${HEADER} ${TOGGLE}`}
    >
      <Icon
        name={toggle.expanded ? 'chevron-down' : 'chevron-right'}
        size={14}
        className="shrink-0"
      />
      {children}
    </div>
  );
}

export function GroupHeader({ label, count, tone, toggle }: GroupHeaderProps) {
  const name = accessibleName(label, count);
  const content = (
    <>
      {label}
      <GroupCount count={count} tone={tone} />
    </>
  );
  if (toggle) {
    return (
      <ToggleHeader label={name} toggle={toggle}>
        {content}
      </ToggleHeader>
    );
  }
  return (
    <h2 aria-label={name} className={`m-0 ${HEADER}`}>
      {content}
    </h2>
  );
}

export interface GroupBlockProps extends GroupHeaderProps {
  children: ReactNode;
}

export function GroupBlock({ children, ...header }: GroupBlockProps) {
  const expanded = header.toggle?.expanded ?? true;
  return (
    <div role="group" aria-label={header.label}>
      <GroupHeader {...header} />
      {expanded ? children : null}
    </div>
  );
}
