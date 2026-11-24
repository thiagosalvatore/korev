import type { CommandResult, CommandRunner } from './command-runner';

const RATE_LIMITED = /rate limit|HTTP 429/i;
const FIRST_BACKOFF_MS = 60_000;
const MAX_BACKOFF_MS = 15 * 60_000;
const SECOND_MS = 1000;
const WAITING: CommandResult = {
  exitCode: 1,
  stdout: '',
  stderr: 'Waiting for the GitHub rate limit to reset',
};

function header(stdout: string, name: string): number | null {
  if (!stdout.startsWith('HTTP/')) return null;
  const headers = stdout.slice(0, stdout.search(/\r?\n\r?\n/));
  const value = new RegExp(`^${name}:\\s*(\\d+)`, 'im').exec(headers)?.[1];
  return value === undefined ? null : Number(value);
}

// Reads the reset time from `gh api -i` output; other commands give no headers.
function resetAt(stdout: string, now: number): number | null {
  const retryAfter = header(stdout, 'retry-after');
  if (retryAfter) return now + retryAfter * SECOND_MS;
  const reset = header(stdout, 'x-ratelimit-reset');
  if (header(stdout, 'x-ratelimit-remaining') === 0 && reset)
    return reset * SECOND_MS;
  return null;
}

export interface GhBackoff {
  run: CommandRunner;
  waiting(): boolean;
}

export function createGhBackoff(
  run: CommandRunner,
  now: () => number,
): GhBackoff {
  let until = 0;
  let delay = 0;
  const waiting = () => now() < until;
  return {
    waiting,
    async run(file, args, options) {
      if (file !== 'gh') return run(file, args, options);
      if (waiting()) return WAITING;
      const result = await run(file, args, options);
      if (!RATE_LIMITED.test(result.stderr)) {
        if (result.exitCode === 0) delay = 0;
        return result;
      }
      delay = delay ? Math.min(delay * 2, MAX_BACKOFF_MS) : FIRST_BACKOFF_MS;
      until = Math.max(until, resetAt(result.stdout, now()) ?? now() + delay);
      return result;
    },
  };
}
