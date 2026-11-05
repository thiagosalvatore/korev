import type { InputHTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '../../cn';
import { Icon, type IconName } from '../core/Icon';
import {
  FIELD_CONTROL_CLASS,
  Field,
  fieldBoxClass,
  type FieldSize,
} from './Field';

export interface InputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'size'
> {
  label?: string;
  hint?: string;
  error?: string;
  icon?: IconName;
  suffix?: ReactNode;
  size?: FieldSize;
  mono?: boolean;
  ref?: Ref<HTMLInputElement>;
}

export function Input({
  label,
  hint,
  error,
  icon,
  suffix,
  size = 'md',
  mono = false,
  disabled,
  className,
  style,
  ...rest
}: InputProps) {
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      className={className}
      style={style}
    >
      <div className={fieldBoxClass({ size, error: Boolean(error), disabled })}>
        {icon ? <Icon name={icon} size={14} /> : null}
        <input
          disabled={disabled}
          className={cn(FIELD_CONTROL_CLASS, mono && 'font-mono text-xs')}
          {...rest}
        />
        {suffix}
      </div>
    </Field>
  );
}
