import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from 'react';
import { LoaderCircle, type LucideIcon } from 'lucide-react';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'success';
type ButtonSize = 'sm' | 'md' | 'lg';

const ICON_SIZE: Record<ButtonSize, number> = { sm: 13, md: 14, lg: 16 };

interface LookProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  loading?: boolean;
}

function buttonClass(variant: ButtonVariant, size: ButtonSize) {
  return `kv-btn kv-btn--${variant} kv-btn--${size}`;
}

function ButtonContent({
  size,
  icon: Icon,
  loading,
  children,
}: LookProps & { size: ButtonSize; children: ReactNode }) {
  const iconSize = ICON_SIZE[size];
  return (
    <>
      {loading ? (
        <LoaderCircle size={iconSize} className="kv-spin" />
      ) : (
        Icon && <Icon size={iconSize} />
      )}
      {children}
    </>
  );
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  loading = false,
  children,
  type = 'button',
  disabled,
  ...rest
}: LookProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size)}
      disabled={disabled || loading}
      {...rest}
    >
      <ButtonContent size={size} icon={icon} loading={loading}>
        {children}
      </ButtonContent>
    </button>
  );
}

export function LinkButton({
  variant = 'secondary',
  size = 'md',
  icon,
  children,
  ...rest
}: Omit<LookProps, 'loading'> & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a className={buttonClass(variant, size)} {...rest}>
      <ButtonContent size={size} icon={icon}>
        {children}
      </ButtonContent>
    </a>
  );
}
