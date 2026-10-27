export const LISTENING_HASH = 'listening';
const WORD = /[\p{L}\p{N}]+/gu;
const LEADING_PUNCTUATION = /^[^\p{L}\p{N}]+/u;
const ACCENT = /\p{M}/gu;
const GREETINGS = new Set(['hey', 'hei', 'rei', 'ok', 'okay']);
const WAKE_SOUND = /^k(?:a|o|u|au)r[aeiou]{1,2}[vf]i?$/;
const WAKE_WORD_LENGTHS = [1, 2];

function plain(word: string): string {
  return word
    .normalize('NFD')
    .replace(ACCENT, '')
    .toLowerCase()
    .replace(/c/g, 'k');
}

function soundsLikeKorev(words: RegExpExecArray[]): boolean {
  return WAKE_SOUND.test(words.map((word) => plain(word[0])).join(''));
}

export function stripWakeWord(spoken: string): string | null {
  const words = [...spoken.matchAll(WORD)];
  const start = GREETINGS.has(plain(words[0]?.[0] ?? '')) ? 1 : 0;
  for (const length of WAKE_WORD_LENGTHS) {
    const wake = words.slice(start, start + length);
    if (wake.length < length || !soundsLikeKorev(wake)) continue;
    const last = wake[wake.length - 1];
    const rest = spoken.slice(last.index + last[0].length);
    return rest.replace(LEADING_PUNCTUATION, '').trim();
  }
  return null;
}
