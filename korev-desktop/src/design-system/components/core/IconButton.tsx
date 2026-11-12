import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
} from 'react';
import { cn } from '../../cn';
import { Icon, LOADING_ICON, type IconName } from './Icon';
import { usePendingClick, type ClickHandler } from './usePendingClick';

export type IconButtonVariant = 'ghost' | 'secondary';
export type IconButtonSize = 'sm' | 'md';

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'onClick'
> {
  onClick?: ClickHandler;
  icon: IconName;
  label: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  active?: boolean;
}

const BASE =
  'inline-flex size-control-md cursor-pointer items-center justify-center rounded-sm border border-transparent bg-transparent text-fg-3 transition-colors duration-(--dur-fast) ease-out focus-visible:shadow-focus enabled:hover:bg-hover enabled:hover:text-fg-1 disabled:cursor-not-allowed disabled:not-aria-busy:opacity-40 aria-pressed:bg-accent-subtle aria-pressed:text-accent-text';

const VARIANTS: Record<IconButtonVariant, string> = {
  ghost: '',
  secondary: 'border-border-2 bg-raised text-fg-2',
};

const SIZES: Record<IconButtonSize, string> = {
  sm: 'size-control-sm',
  md: '',
};

const TOOLTIP =
  'pointer-events-none fixed inset-auto m-1 max-w-64 rounded-sm border-0 bg-raised px-2 py-1 text-left text-xs font-normal whitespace-normal text-fg-1 shadow-pop [position-area:top] [position-try-fallbacks:top_span-left,top_span-right,bottom,bottom_span-left,bottom_span-right]';
const TOOLTIP_DELAY_MS = 500;

function useTooltip() {
  const [shown, setShown] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const anchor = useRef<HTMLButtonElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (shown && anchor.current)
      tooltip.current?.showPopover?.({ source: anchor.current });
  }, [shown]);
  const show = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShown(true), TOOLTIP_DELAY_MS);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setShown(false);
  };
  return { shown, show, hide, anchor, tooltip };
}

export function IconButton({
  icon,
  label,
  title,
  variant = 'ghost',
  size = 'md',
  active,
  className,
  disabled,
  onClick,
  ...rest
}: IconButtonProps) {
  const { pending, handleClick } = usePendingClick(onClick);
  const { shown, show, hide, anchor, tooltip } = useTooltip();
  const tooltipId = useId();
  return (
    <button
      ref={anchor}
      type="button"
      aria-label={label}
      aria-describedby={title ? tooltipId : undefined}
      title={disabled ? (title ?? label) : undefined}
      aria-pressed={active}
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      onClick={handleClick}
      onPointerEnter={show}
      onPointerLeave={hide}
      onPointerDown={hide}
      onFocus={show}
      onBlur={hide}
      onKeyDown={(event) => {
        if (event.key === 'Escape') hide();
      }}
      {...rest}
    >
      <Icon
        name={pending ? LOADING_ICON : icon}
        size={size === 'sm' ? 14 : 16}
      />
      {shown ? (
        <span ref={tooltip} popover="manual" role="tooltip" className={TOOLTIP}>
          {title ?? label}
        </span>
      ) : null}
      {title ? (
        <span id={tooltipId} hidden>
          {title}
        </span>
      ) : null}
    </button>
  );
}
