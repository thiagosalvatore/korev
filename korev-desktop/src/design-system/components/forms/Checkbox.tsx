import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '../../cn';
import { Icon } from '../core/Icon';
import {
  CHOICE_BOX_CLASS,
  CHOICE_BOX_IDLE_CLASS,
  ChoiceLabel,
  HIDDEN_INPUT_CLASS,
} from './Choice';

export interface CheckboxProps {
  label?: ReactNode;
  checked?: boolean;
  indeterminate?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

const MARK_STROKE = 3;

export function Checkbox({
  label,
  checked = false,
  indeterminate = false,
  onChange,
  disabled,
  className,
}: CheckboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  const filled = checked || indeterminate;
  return (
    <ChoiceLabel label={label} disabled={disabled} className={className}>
      <input
        ref={inputRef}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.checked)}
        className={HIDDEN_INPUT_CLASS}
      />
      <span
        className={cn(
          CHOICE_BOX_CLASS,
          'rounded-[4px]',
          filled ? 'border-accent bg-accent' : CHOICE_BOX_IDLE_CLASS,
        )}
      >
        {filled ? (
          <Icon
            name={indeterminate ? 'minus' : 'check'}
            size={11}
            strokeWidth={MARK_STROKE}
          />
        ) : null}
      </span>
    </ChoiceLabel>
  );
}
