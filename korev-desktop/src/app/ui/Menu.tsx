import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { cn, Icon, Kbd, type IconName } from '../../design-system';

export interface MenuItem {
  id: string;
  label: ReactNode;
  ariaLabel?: string;
  icon?: IconName;
  hint?: string;
  checked?: boolean;
  danger?: boolean;
  disabled?: boolean;
  section?: string;
  onSelect: () => void;
}

export interface MenuProps {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  items: MenuItem[];
  align?: 'left' | 'right';
  side?: 'top' | 'bottom';
  width?: number;
  label: string;
}

export const PANEL =
  'absolute z-50 max-h-[60vh] min-w-48 animate-fade-fast overflow-y-auto rounded-md bg-raised p-1 shadow-pop';

const POSITION_AREAS = {
  bottom: {
    left: '[position-area:bottom_span-right]',
    right: '[position-area:bottom_span-left]',
  },
  top: {
    left: '[position-area:top_span-right]',
    right: '[position-area:top_span-left]',
  },
} as const;

export function useDismiss(
  root: RefObject<HTMLElement | null>,
  open: boolean,
  dismiss: () => void,
) {
  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) dismiss();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', escape);
    };
  }, [root, open, dismiss]);
}

export function Menu({
  trigger,
  items,
  align = 'left',
  side = 'bottom',
  width,
  label,
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(root, open, close);
  useEffect(() => {
    if (open && root.current)
      panel.current?.showPopover?.({ source: root.current });
  }, [open]);

  let lastSection: string | undefined;
  return (
    <div ref={root} className="relative inline-flex">
      {trigger({ open, toggle: () => setOpen((value) => !value) })}
      {open ? (
        <div
          ref={panel}
          popover="manual"
          role="menu"
          aria-label={label}
          className={cn(
            PANEL,
            'fixed inset-auto m-0 my-1 border-0 [position-try-fallbacks:flip-block]',
            POSITION_AREAS[side][align],
          )}
          style={width ? { width } : undefined}
        >
          {items.map((item) => {
            const header =
              item.section && item.section !== lastSection
                ? item.section
                : null;
            lastSection = item.section;
            return (
              <div key={item.id}>
                {header ? (
                  <div className="px-2 pt-2 pb-1 type-overline text-fg-4">
                    {header}
                  </div>
                ) : null}
                <button
                  type="button"
                  role="menuitem"
                  aria-label={item.ariaLabel}
                  disabled={item.disabled}
                  className={cn(
                    'flex h-7 w-full cursor-pointer items-center gap-2 rounded-sm border-0 bg-transparent px-2 text-left text-sm text-fg-1 hover:bg-hover disabled:cursor-default disabled:opacity-40',
                    item.danger && 'text-danger-text',
                  )}
                  onClick={() => {
                    setOpen(false);
                    item.onSelect();
                  }}
                >
                  {item.icon ? (
                    <Icon name={item.icon} size={14} className="text-fg-3" />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.checked ? (
                    <Icon name="check" size={14} className="text-accent-text" />
                  ) : null}
                  {item.hint ? <Kbd>{item.hint}</Kbd> : null}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
