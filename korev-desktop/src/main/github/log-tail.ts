export const LOG_WINDOW_BYTES = 256 * 1024;
export const LOG_TAIL_LINES = 200;
const NEWLINE = '\n';

export async function tailLines(
  chunks: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
  windowBytes = LOG_WINDOW_BYTES,
  lineCount = LOG_TAIL_LINES,
): Promise<string> {
  let window = Buffer.alloc(0);
  let cut = false;
  for await (const chunk of chunks) {
    window = Buffer.concat([window, chunk]);
    if (window.length > windowBytes) {
      window = window.subarray(window.length - windowBytes);
      cut = true;
    }
  }
  const lines = window.toString('utf8').replace(/\n$/, '').split(NEWLINE);
  const whole = cut ? lines.slice(1) : lines;
  return whole.slice(-lineCount).join(NEWLINE);
}
