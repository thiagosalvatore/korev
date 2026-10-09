export type ComposerAction = 'mic' | 'send' | 'stop';

export interface ComposerState {
  canSend: boolean;
  running: boolean;
  dictating: boolean;
  voice: boolean;
}

export function composerAction({
  canSend,
  running,
  dictating,
  voice,
}: ComposerState): ComposerAction {
  if (dictating) return 'mic';
  if (canSend) return 'send';
  if (running) return 'stop';
  return voice ? 'mic' : 'send';
}
