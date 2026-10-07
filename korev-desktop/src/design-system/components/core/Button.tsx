import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../cn';
import { Icon, type IconName } from './Icon';
import { Kbd } from './Kbd';
import { usePendingClick, type ClickHandler } from './usePendingClick';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onClick'
> {
  onClick?: ClickHandler;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  kbd?: string;
}

const BASE =
  'inline-flex h-control-md cursor-pointer items-center justify-center gap-1.5 rounded-sm border border-transparent px-3 font-sans text-sm leading-none font-medium tracking-[-0.005em] whitespace-nowrap select-none transition-[background-color,border-color,color,transform] duration-(--dur-fast) ease-out focus-visible:shadow-focus enabled:active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-45';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-fg-on-accent shadow-inset-top enabled:hover:bg-accent-hover enabled:active:bg-accent-press',
  secondary:
    'border-border-2 bg-raised text-fg-1 shadow-inset-top enabled:hover:border-border-strong enabled:hover:bg-hover',
  ghost:
    'bg-transparent text-fg-2 enabled:hover:bg-hover enabled:hover:text-fg-1',
  danger:
    'border-danger/30 bg-danger-subtle text-danger-text enabled:hover:bg-danger/22',
  success: 'bg-success text-gray-0 shadow-inset-top enabled:hover:bg-green-400',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-control-sm gap-[5px] px-[9px] text-xs',
  md: '',
  lg: 'h-control-lg px-4 text-md',
};

const ICON_SIZES: Record<ButtonSize, number> = { sm: 13, md: 14, lg: 16 };

const KBD_ON_ACCENT = 'border-white/20 bg-white/16 text-white';

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  loading = false,
  kbd,
  children,
  className,
  type = 'button',
  disabled,
  onClick,
  ...rest
}: ButtonProps) {
  const iconSize = ICON_SIZES[size];
  const { pending, handleClick } = usePendingClick(onClick);
  const busy = loading || pending;
  return (
    <button
      type={type}
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      onClick={handleClick}
      {...rest}
    >
      {busy ? (
        <Icon name="loader-circle" size={iconSize} className="animate-spin" />
      ) : icon ? (
        <Icon name={icon} size={iconSize} />
      ) : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={iconSize} /> : null}
      {kbd ? (
        <Kbd
          className={cn('-mr-1 ml-1', variant === 'primary' && KBD_ON_ACCENT)}
        >
          {kbd}
        </Kbd>
      ) : null}
    </button>
  );
}
