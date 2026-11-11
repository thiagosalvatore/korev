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
  onCancel(): void;
}

function DiscardButton({ onCancel }: { onCancel(): void }) {
  return (
    <IconButton
      icon="trash-2"
      label="Discard recording (Esc)"
      size="sm"
      onClick={onCancel}
    />
  );
}

export function DictationButton({
  status,
  phase,
  onToggle,
  onCancel,
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
      <span className="flex items-center gap-1">
        <DiscardButton onCancel={onCancel} />
        <IconButton
          icon="loader-circle"
          label="Turning speech into text"
          size="sm"
          disabled
        />
      </span>
    );
  if (phase === 'recording')
    return (
      <span className="flex items-center gap-1">
        <DiscardButton onCancel={onCancel} />
        <button
          type="button"
          aria-label="Stop and insert text"
          title={`Stop and insert text (${DICTATION_SHORTCUT})`}
          className="flex size-7 cursor-pointer items-center justify-center rounded-full border-0 bg-danger text-fg-on-accent"
          onClick={onToggle}
        >
          <Icon name="check" size={15} />
        </button>
      </span>
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
