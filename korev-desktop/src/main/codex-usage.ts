import { readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import type { PlanLimit, TurnUsage } from '../shared/model';
import { epochMs, num, parseJsonLine, record } from './agent-events';

const TOKEN_COUNT = '"token_count"';
const MINUTES_PER_HOUR = 60;
const CODEX_WINDOW_LABELS: Record<number, string> = {
  300: '5-hour limit',
  10_080: 'Weekly limit',
};

function windowLabel(minutes: number): string {
  return (
    CODEX_WINDOW_LABELS[minutes] ??
    `${Math.round(minutes / MINUTES_PER_HOUR)}h limit`
  );
}

function codexLimit(window: unknown): PlanLimit[] {
  if (!window) return [];
  const entry = record(window);
  return [
    {
      label: windowLabel(num(entry.window_minutes)),
      usedPercent: num(entry.used_percent),
      resetsAt: epochMs(entry.resets_at),
    },
  ];
}

export function parseCodexRollout(text: string): TurnUsage | null {
  const line = text
    .split('\n')
    .findLast((entry) => entry.includes(TOKEN_COUNT));
  const payload = record(parseJsonLine(line ?? '')?.payload);
  if (payload.type !== 'token_count') return null;
  const info = record(payload.info);
  const usedTokens = num(record(info.last_token_usage).total_tokens);
  const windowTokens = num(info.model_context_window);
  const rateLimits = record(payload.rate_limits);
  return {
    context: usedTokens && windowTokens ? { usedTokens, windowTokens } : null,
    limits: [
      ...codexLimit(rateLimits.primary),
      ...codexLimit(rateLimits.secondary),
    ],
  };
}

function sessionsDir(env: NodeJS.ProcessEnv): string {
  return path.join(
    env.CODEX_HOME ?? path.join(homedir(), '.codex'),
    'sessions',
  );
}

export async function readCodexUsage(
  env: NodeJS.ProcessEnv,
  threadId: string | null,
): Promise<TurnUsage | null> {
  if (!threadId) return null;
  try {
    const dir = sessionsDir(env);
    const files = await readdir(dir, { recursive: true });
    const rollout = files.find((file) => file.endsWith(`-${threadId}.jsonl`));
    if (!rollout) return null;
    return parseCodexRollout(await readFile(path.join(dir, rollout), 'utf8'));
  } catch {
    return null;
  }
}
