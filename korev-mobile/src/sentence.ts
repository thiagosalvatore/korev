export const SPEECH_ABOVE_FLOOR_DB = 20;
export const QUIETEST_FLOOR_DB = -60;
export const SILENCE_MS = 800;
export const MAX_WAIT_MS = 15_000;
export const MAX_SENTENCE_MS = 30_000;

export type Heard = 'waiting' | 'sentence' | 'nothing';

export function createSentenceDetector(startedAt: number) {
  let floor: number | null = null;
  let speechStartedAt: number | null = null;
  let lastSpeechAt = startedAt;

  function isSpeech(decibels: number | undefined): boolean {
    if (decibels === undefined) return false;
    floor = Math.max(QUIETEST_FLOOR_DB, Math.min(floor ?? decibels, decibels));
    return decibels > floor + SPEECH_ABOVE_FLOOR_DB;
  }

  return (decibels: number | undefined, now: number): Heard => {
    if (isSpeech(decibels)) {
      speechStartedAt ??= now;
      lastSpeechAt = now;
    }
    if (speechStartedAt === null)
      return now - startedAt >= MAX_WAIT_MS ? 'nothing' : 'waiting';
    const paused = now - lastSpeechAt >= SILENCE_MS;
    const tooLong = now - speechStartedAt >= MAX_SENTENCE_MS;
    return paused || tooLong ? 'sentence' : 'waiting';
  };
}
