import type { ReactNode } from 'react';
import { cn } from '../../cn';
import { Button } from '../core/Button';
import { Icon } from '../core/Icon';

export interface ErrorStateProps {
  title: string;
  detail?: string | null;
  onRetry?: () => unknown;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function ErrorState({
  title,
  detail,
  onRetry,
  actions,
  children,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center gap-3 px-6 text-center',
        className,
      )}
    >
      <Icon name="circle-alert" size={22} className="text-danger-text" />
      <p className="m-0 type-h3 text-fg-1">{title}</p>
      {detail ? (
        <pre className="m-0 max-h-64 w-full max-w-xl overflow-auto rounded-md bg-inset px-3 py-2 text-left font-mono text-xs break-words whitespace-pre-wrap text-fg-3 select-text">
          {detail}
        </pre>
      ) : null}
      {children}
      <div className="flex gap-2">
        {onRetry ? (
          <Button
            size="sm"
            variant="primary"
            icon="refresh-cw"
            onClick={onRetry}
          >
            Try again
          </Button>
        ) : null}
        {actions}
      </div>
    </div>
  );
}
