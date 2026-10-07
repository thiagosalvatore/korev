import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../cn';
import { Icon, type IconName } from './Icon';
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
  'inline-flex size-control-md cursor-pointer items-center justify-center rounded-sm border border-transparent bg-transparent text-fg-3 transition-colors duration-(--dur-fast) ease-out focus-visible:shadow-focus enabled:hover:bg-hover enabled:hover:text-fg-1 disabled:cursor-not-allowed disabled:opacity-40 aria-pressed:bg-accent-subtle aria-pressed:text-accent-text';

const VARIANTS: Record<IconButtonVariant, string> = {
  ghost: '',
  secondary: 'border-border-2 bg-raised text-fg-2',
};

const SIZES: Record<IconButtonSize, string> = {
  sm: 'size-control-sm',
  md: '',
};

export function IconButton({
  icon,
  label,
  variant = 'ghost',
  size = 'md',
  active,
  className,
  disabled,
  onClick,
  ...rest
}: IconButtonProps) {
  const { pending, handleClick } = usePendingClick(onClick);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      onClick={handleClick}
      {...rest}
    >
      <Icon
        name={pending ? 'loader-circle' : icon}
        size={size === 'sm' ? 14 : 16}
        className={pending ? 'animate-spin' : undefined}
      />
    </button>
  );
}
