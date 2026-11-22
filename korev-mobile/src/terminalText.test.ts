import { describe, expect, it } from 'vitest';
import { appendTerminalText, plainTerminalText } from './terminalText';

describe('plainTerminalText', () => {
  it('drops colour codes and terminal titles', () => {
    expect(
      plainTerminalText(
        '\u001b[32m✓ built\u001b[0m\u001b]0;npm run dev\u0007\r\n',
      ),
    ).toBe('✓ built\n');
  });

  it('keeps only the last state of a line redrawn with a carriage return', () => {
    expect(
      plainTerminalText('installing 10%\rinstalling 90%\rdone\nnext'),
    ).toBe('done\nnext');
  });
});

describe('appendTerminalText', () => {
  it('keeps the newest text when the output grows past the limit', () => {
    expect(appendTerminalText('abcdef', 'gh', 5)).toBe('defgh');
  });
});
