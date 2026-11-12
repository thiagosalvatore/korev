import { describe, expect, it } from 'vitest';
import type { ChatItem } from '../shared/model';
import { replayPrompt } from './chats';

const HISTORY: ChatItem[] = [
  { id: 'u1', kind: 'user', text: 'Hi', at: '', checkpoint: null },
  { id: 'a1', kind: 'assistant', text: 'Hello' },
];

describe('replayPrompt', () => {
  it('puts the conversation before the message', () => {
    expect(replayPrompt(HISTORY, 'Go on')).toMatch(
      /^<previous-conversation>[\s\S]*Assistant: Hello\n<\/previous-conversation>\n\nGo on$/,
    );
  });

  it('keeps a slash command first so the agent still runs it', () => {
    expect(replayPrompt(HISTORY, '/compact')).toMatch(
      /^\/compact\n\n<previous-conversation>[\s\S]*Assistant: Hello\n<\/previous-conversation>$/,
    );
  });
});
