import { cn } from '../../cn';
import { DiffStat } from './DiffStat';

export type FileStatus = 'A' | 'M' | 'D' | 'R';

export interface FileRowProps {
  path: string;
  status?: FileStatus;
  additions?: number;
  deletions?: number;
  reviewed?: boolean;
  active?: boolean;
  onClick?: () => void;
  showStat?: boolean;
}

const STATUS_CLASS: Record<FileStatus, string> = {
  A: 'text-diff-add-fg',
  M: 'text-warning-text',
  D: 'text-diff-del-fg',
  R: 'text-accent-text',
};

export function FileRow({
  path,
  status = 'M',
  additions = 0,
  deletions = 0,
  reviewed = false,
  active = false,
  onClick,
  showStat = true,
}: FileRowProps) {
  return (
    <div
      className={cn(
        'flex h-control-md min-w-0 cursor-pointer items-center gap-2 rounded-sm pr-2 pl-2.5 font-mono text-xs leading-none text-fg-2 transition-colors duration-(--dur-fast) ease-out hover:bg-hover hover:text-fg-1',
        active && 'bg-active text-fg-1',
      )}
      onClick={onClick}
      title={path}
    >
      <span className={cn('w-3.5 flex-none text-center', STATUS_CLASS[status])}>
        {status}
      </span>
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-left [direction:rtl]',
          reviewed && 'text-fg-4 line-through decoration-border-strong',
        )}
      >
        <bdi>{path}</bdi>
      </span>
      {showStat ? (
        <DiffStat additions={additions} deletions={deletions} showBar={false} />
      ) : null}
    </div>
  );
}
