import { describe, expect, it } from 'vitest';
import { composerAction, type ComposerState } from './composerAction';

const IDLE: ComposerState = {
  canSend: false,
  running: false,
  dictating: false,
  voice: true,
};

describe('composerAction', () => {
  it('offers the microphone when there is nothing to send', () => {
    expect(composerAction(IDLE)).toBe('mic');
  });

  it('offers send once there is something to send', () => {
    expect(composerAction({ ...IDLE, canSend: true })).toBe('send');
  });

  it('offers stop while the agent runs and the input is empty', () => {
    expect(composerAction({ ...IDLE, running: true })).toBe('stop');
  });

  it('offers send while the agent runs so you can steer it', () => {
    expect(composerAction({ ...IDLE, running: true, canSend: true })).toBe(
      'send',
    );
  });

  it('keeps the microphone while dictating', () => {
    expect(
      composerAction({
        ...IDLE,
        running: true,
        canSend: true,
        dictating: true,
      }),
    ).toBe('mic');
  });

  it('falls back to send when voice input is unavailable', () => {
    expect(composerAction({ ...IDLE, voice: false })).toBe('send');
  });
});
