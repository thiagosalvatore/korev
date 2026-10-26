import { describe, expect, it } from 'vitest';
import {
  createSentenceDetector,
  MAX_SENTENCE_MS,
  MAX_WAIT_MS,
  QUIETEST_FLOOR_DB,
  SILENCE_MS,
  SPEECH_ABOVE_FLOOR_DB,
} from './sentence';

const ROOM = -44;
const LOUD = ROOM + SPEECH_ABOVE_FLOOR_DB + 5;
const NOISY_ROOM = ROOM + SPEECH_ABOVE_FLOOR_DB - 5;

function detectorInRoom() {
  const heard = createSentenceDetector(0);
  heard(ROOM, 0);
  return heard;
}

describe('createSentenceDetector', () => {
  it('keeps waiting while nobody speaks', () => {
    expect(detectorInRoom()(ROOM, MAX_WAIT_MS - 1)).toBe('waiting');
  });

  it('gives up on a clip with no speech after the maximum wait', () => {
    expect(detectorInRoom()(ROOM, MAX_WAIT_MS)).toBe('nothing');
  });

  it('ignores room noise that stays close to the quietest level', () => {
    const heard = detectorInRoom();
    expect(heard(NOISY_ROOM, 100)).toBe('waiting');
    expect(heard(NOISY_ROOM, MAX_WAIT_MS)).toBe('nothing');
  });

  it('ends the sentence after a pause of silence', () => {
    const heard = detectorInRoom();
    expect(heard(LOUD, 100)).toBe('waiting');
    expect(heard(ROOM, 100 + SILENCE_MS - 1)).toBe('waiting');
    expect(heard(ROOM, 100 + SILENCE_MS)).toBe('sentence');
  });

  it('keeps a long sentence going past the maximum wait', () => {
    const heard = detectorInRoom();
    heard(LOUD, MAX_WAIT_MS - 1);
    expect(heard(LOUD, MAX_WAIT_MS + 1)).toBe('waiting');
  });

  it('cuts off a sentence that never pauses', () => {
    const heard = detectorInRoom();
    heard(LOUD, 100);
    expect(heard(LOUD, 100 + MAX_SENTENCE_MS)).toBe('sentence');
  });

  it('hears speech that started before the clip once the speaker pauses', () => {
    const heard = createSentenceDetector(0);
    heard(LOUD, 0);
    heard(ROOM, 100);
    expect(heard(LOUD, 200)).toBe('waiting');
    expect(heard(ROOM, 200 + SILENCE_MS)).toBe('sentence');
  });

  it('does not take a dead reading as the quietest level', () => {
    const heard = createSentenceDetector(0);
    heard(-160, 0);
    expect(heard(QUIETEST_FLOOR_DB + SPEECH_ABOVE_FLOOR_DB - 1, 100)).toBe(
      'waiting',
    );
  });
});
