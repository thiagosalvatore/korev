import type { KeyboardEvent } from 'react';
import { Icon, IconButton } from '../../design-system';
import type { DictationStatus } from '../../shared/model';
import type { DictationPhase } from './dictation';

export const DICTATION_SHORTCUT = '⌘⇧S';

export function isDictationShortcut(event: KeyboardEvent): boolean {
  return (
    (event.metaKey || event.ctrlKey) &&
    event.shiftKey &&
    event.key.toLowerCase() === 's'
  );
}

interface DictationButtonProps {
  status: DictationStatus | undefined;
  phase: DictationPhase;
  onToggle(): void;
}

export function DictationButton({
  status,
  phase,
  onToggle,
}: DictationButtonProps) {
  if (status?.status === 'downloading')
    return (
      <button
        type="button"
        aria-label="Downloading the voice model"
        title="Downloading the voice model"
        className="flex h-7 cursor-pointer items-center gap-1 rounded-sm border-0 bg-transparent px-2 text-xs text-fg-3 tabular-nums hover:bg-hover hover:text-fg-1"
        onClick={onToggle}
      >
        <Icon name="mic" size={14} />
        {status.progress}%
      </button>
    );
  if (status?.status !== 'ready')
    return (
      <IconButton
        icon="mic"
        label="Voice input (download needed)"
        size="sm"
        onClick={onToggle}
      />
    );
  if (phase === 'transcribing')
    return (
      <IconButton
        icon="loader-circle"
        label="Turning speech into text"
        size="sm"
        className="[&_svg]:animate-spin"
        disabled
      />
    );
  if (phase === 'recording')
    return (
      <button
        type="button"
        aria-label="Stop and insert text"
        title={`Stop and insert text (${DICTATION_SHORTCUT})`}
        className="flex size-7 cursor-pointer items-center justify-center rounded-full border-0 bg-danger text-fg-on-accent"
        onClick={onToggle}
      >
        <Icon name="check" size={15} />
      </button>
    );
  return (
    <IconButton
      icon="mic"
      label={`Voice input (${DICTATION_SHORTCUT})`}
      size="sm"
      onClick={onToggle}
    />
  );
}
