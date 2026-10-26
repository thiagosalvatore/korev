import { IconButton } from '../design-system';
import type { DictationStatus } from '../shared/model';
import { toggleHandsFree } from './actions';
import { api } from './bridge';
import { VoiceModelDialog } from './chat/VoiceModelDialog';
import { useHandsFree } from './handsFreeListening';
import { NO_DRAG } from './layout';
import { setUi, useUi } from './ui-store';

const HANDS_FREE_SHORTCUT = '⌘⇧H';

export function HandsFreeButton() {
  const enabled = useUi((ui) => ui.handsFree);
  return (
    <IconButton
      icon={enabled ? 'audio-lines' : 'mic'}
      label={`Turn ${enabled ? 'off' : 'on'} hands-free mode (${HANDS_FREE_SHORTCUT})`}
      size="sm"
      active={enabled}
      className={NO_DRAG}
      onClick={toggleHandsFree}
    />
  );
}

export function HandsFree({ status }: { status: DictationStatus }) {
  const enabled = useUi((ui) => ui.handsFree);
  const ready = status.status === 'ready';
  useHandsFree(enabled && ready);
  if (!enabled || ready) return null;
  return (
    <VoiceModelDialog
      status={status}
      onDownload={() => void api.prepareDictation()}
      onStart={() => undefined}
      onClose={() => setUi({ handsFree: false })}
    />
  );
}
