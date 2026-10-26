import { describe, expect, it } from 'vitest';
import {
  END_SILENCE_MS,
  MAX_QUIET_MS,
  MAX_SENTENCE_MS,
  SPEECH_LEVEL,
  listenStep,
  type Sentence,
} from './handsFreeListening';

const QUIET = SPEECH_LEVEL / 2;
const START = 1_000;

function fresh(): Sentence {
  return { startedAt: START, lastSpeechAt: null };
}

describe('listenStep', () => {
  it('keeps recording while nobody speaks', () => {
    expect(listenStep(fresh(), QUIET, START + 100).action).toBe('keep');
  });

  it('drops a recording that stays quiet too long', () => {
    expect(listenStep(fresh(), QUIET, START + MAX_QUIET_MS).action).toBe(
      'drop',
    );
  });

  it('keeps recording through a short pause in a sentence', () => {
    const speaking = listenStep(fresh(), SPEECH_LEVEL, START + 100).sentence;
    expect(
      listenStep(speaking, QUIET, START + 100 + END_SILENCE_MS - 1).action,
    ).toBe('keep');
  });

  it('sends the sentence after a long enough silence', () => {
    const speaking = listenStep(fresh(), SPEECH_LEVEL, START + 100).sentence;
    expect(
      listenStep(speaking, QUIET, START + 100 + END_SILENCE_MS).action,
    ).toBe('send');
  });

  it('sends a sentence that never pauses once it is too long', () => {
    const speaking = listenStep(fresh(), SPEECH_LEVEL, START + 100).sentence;
    expect(
      listenStep(speaking, SPEECH_LEVEL, START + MAX_SENTENCE_MS).action,
    ).toBe('send');
  });
});
