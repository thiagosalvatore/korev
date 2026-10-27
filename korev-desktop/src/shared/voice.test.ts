import { describe, expect, it } from 'vitest';
import { stripWakeWord } from './voice';

describe('stripWakeWord', () => {
  it.each([
    ['Korev, open login', 'open login'],
    ['Hey Corev create a workspace', 'create a workspace'],
    ['Core of. What is waiting?', 'What is waiting?'],
    ['korev', ''],
    ['Korevi, what is waiting?', 'what is waiting?'],
    ['Koriv, open the next workspace.', 'open the next workspace.'],
    ['Hey Kaurav, approve the plan.', 'approve the plan.'],
    ['Core F, open the next workspace.', 'open the next workspace.'],
    ['Rei Korevi, aprove de plen.', 'aprove de plen.'],
    ['Kórev, é você?', 'é você?'],
  ])('finds the wake word in %j', (spoken, command) => {
    expect(stripWakeWord(spoken)).toBe(command);
  });

  it.each([
    'Thanks for watching, see you next time',
    'Core tests are failing again',
    'Karen, can you look at this?',
    'Corey, open the door',
    'Cover the plan later',
  ])('ignores %j', (spoken) => {
    expect(stripWakeWord(spoken)).toBe(null);
  });
});
