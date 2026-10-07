import { describe, expect, it } from 'vitest';
import { parseCodexRollout } from './codex-usage';

function tokenCount(totalTokens: number, rateLimits: object | null) {
  return JSON.stringify({
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: {
        total_token_usage: { total_tokens: 400_000 },
        last_token_usage: { total_tokens: totalTokens },
        model_context_window: 258_400,
      },
      rate_limits: rateLimits,
    },
  });
}

describe('Codex rollout usage', () => {
  it('reads the context fill and plan limits from the last token count', () => {
    const rollout = [
      tokenCount(10_000, null),
      JSON.stringify({ type: 'response_item', payload: { type: 'message' } }),
      tokenCount(54_572, {
        primary: { used_percent: 61, window_minutes: 300, resets_at: 1_000 },
        secondary: {
          used_percent: 23,
          window_minutes: 10_080,
          resets_at: 2_000,
        },
      }),
    ].join('\n');

    expect(parseCodexRollout(rollout)).toEqual({
      context: { usedTokens: 54_572, windowTokens: 258_400 },
      limits: [
        { label: '5-hour limit', usedPercent: 61, resetsAt: 1_000_000 },
        { label: 'Weekly limit', usedPercent: 23, resetsAt: 2_000_000 },
      ],
    });
  });

  it('reports no plan limits when the account has none', () => {
    expect(parseCodexRollout(tokenCount(1_000, null))).toEqual({
      context: { usedTokens: 1_000, windowTokens: 258_400 },
      limits: [],
    });
  });

  it('has no usage before the first token count', () => {
    expect(parseCodexRollout('')).toBeNull();
  });
});
