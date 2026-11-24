const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);

const ESCAPE_SEQUENCE = new RegExp(
  [
    `${ESC}\\[[0-?]*[ -/]*[@-~]`,
    `${ESC}\\][^${BEL}${ESC}]*(?:${BEL}|${ESC}\\\\)`,
    `${ESC}[@-Z\\\\-_]`,
  ].join('|'),
  'g',
);

function lastRedraw(line: string): string {
  return line.split('\r').at(-1) ?? '';
}

export function plainTerminalText(data: string): string {
  return data
    .replace(ESCAPE_SEQUENCE, '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(lastRedraw)
    .join('\n');
}

export function appendTerminalText(
  current: string,
  chunk: string,
  maxLength: number,
): string {
  return (current + chunk).slice(-maxLength);
}
