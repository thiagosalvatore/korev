import {
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cn } from '../../cn';
import { Button } from '../core/Button';
import type { IconName } from '../core/Icon';
import { Checkbox } from '../forms/Checkbox';

export interface CheckboxMenuItem {
  id: string;
  label: string;
}

export interface CheckboxMenuGroup {
  id: string;
  label: string;
  icon?: ReactNode;
  items: CheckboxMenuItem[];
}

export interface CheckboxMenuProps {
  label: string;
  triggerLabel: ReactNode;
  triggerIcon?: IconName;
  triggerClassName?: string;
  groups: CheckboxMenuGroup[];
  selected: string[];
  onChange: (selected: string[]) => void;
  resetLabel: string;
  onReset: () => void;
}

const CHECKBOX_SELECTOR = 'input[type="checkbox"]';
const MOVES: Partial<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1 };

function checkboxesIn(panel: HTMLElement | null): HTMLInputElement[] {
  return panel
    ? [...panel.querySelectorAll<HTMLInputElement>(CHECKBOX_SELECTOR)]
    : [];
}

function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
  const step = MOVES[event.key];
  if (step === undefined) return;
  event.preventDefault();
  const boxes = checkboxesIn(event.currentTarget);
  const current = boxes.indexOf(document.activeElement as HTMLInputElement);
  boxes[current + step]?.focus();
}

function toggled(selected: string[], ids: string[], on: boolean): string[] {
  const rest = selected.filter((id) => !ids.includes(id));
  return on ? [...rest, ...ids] : rest;
}

function isOpenState(event: Event): boolean {
  return (event as ToggleEvent).newState === 'open';
}

interface PopoverState {
  open: boolean;
  openNow: RefObject<boolean>;
}

function usePopoverState(panelId: string, triggerId: string): PopoverState {
  const [open, setOpen] = useState(false);
  const openNow = useRef(false);
  useEffect(() => {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    const noteOpening = (event: Event) => {
      openNow.current = isOpenState(event);
    };
    const followToggle = (event: Event) => {
      setOpen(isOpenState(event));
      if (isOpenState(event)) checkboxesIn(panel)[0]?.focus();
      else document.getElementById(triggerId)?.focus();
    };
    panel.addEventListener('beforetoggle', noteOpening);
    panel.addEventListener('toggle', followToggle);
    return () => {
      panel.removeEventListener('beforetoggle', noteOpening);
      panel.removeEventListener('toggle', followToggle);
    };
  }, [panelId, triggerId]);
  return { open, openNow };
}

function useCloseOnEscape(openNow: RefObject<boolean>, panelId: string) {
  useEffect(() => {
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || !openNow.current) return;
      event.preventDefault();
      event.stopPropagation();
      document.getElementById(panelId)?.hidePopover();
    };
    window.addEventListener('keydown', closeOnEscape, true);
    return () => window.removeEventListener('keydown', closeOnEscape, true);
  }, [openNow, panelId]);
}

interface MenuGroupProps {
  group: CheckboxMenuGroup;
  selected: string[];
  onChange: (selected: string[]) => void;
}

function MenuGroup({ group, selected, onChange }: MenuGroupProps) {
  const ids = group.items.map((item) => item.id);
  const chosen = ids.filter((id) => selected.includes(id));
  const all = chosen.length === ids.length;
  return (
    <div role="group" aria-label={group.label} className="flex flex-col py-1">
      <Checkbox
        label={
          <span className="inline-flex items-center gap-1.5">
            {group.icon}
            {group.label}
          </span>
        }
        checked={all}
        indeterminate={!all && chosen.length > 0}
        onChange={() => onChange(toggled(selected, ids, !all))}
        className="px-3 py-1 font-medium"
      />
      {group.items.map((item) => (
        <Checkbox
          key={item.id}
          label={item.label}
          checked={selected.includes(item.id)}
          onChange={(checked) =>
            onChange(toggled(selected, [item.id], checked))
          }
          className="py-1 pr-3 pl-8"
        />
      ))}
    </div>
  );
}

export function CheckboxMenu({
  label,
  triggerLabel,
  triggerIcon,
  triggerClassName,
  groups,
  selected,
  onChange,
  resetLabel,
  onReset,
}: CheckboxMenuProps) {
  const panelId = useId();
  const triggerId = useId();
  const { open, openNow } = usePopoverState(panelId, triggerId);
  useCloseOnEscape(openNow, panelId);
  return (
    <>
      <Button
        id={triggerId}
        variant="ghost"
        size="sm"
        icon={triggerIcon}
        iconRight="chevron-down"
        aria-label={label}
        aria-haspopup="true"
        aria-expanded={open}
        popoverTarget={panelId}
        className={triggerClassName}
      >
        {triggerLabel}
      </Button>
      <div
        id={panelId}
        popover="auto"
        role="dialog"
        aria-label={label}
        onKeyDown={moveFocus}
        className={cn(
          'm-0 mt-1 max-h-[60vh] w-64 animate-fade overflow-auto rounded-md border-0 bg-raised p-0 py-1 text-fg-1 shadow-pop',
          '[position-area:bottom_span-right] [position-try-fallbacks:flip-block]',
        )}
      >
        {groups.map((group) => (
          <MenuGroup
            key={group.id}
            group={group}
            selected={selected}
            onChange={onChange}
          />
        ))}
        <div className="border-t border-border-1 px-3 pt-2 pb-1">
          <Button size="sm" variant="ghost" onClick={onReset}>
            {resetLabel}
          </Button>
        </div>
      </div>
    </>
  );
}
