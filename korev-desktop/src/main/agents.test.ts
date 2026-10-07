import { describe, expect, it } from 'vitest';
import type { AgentKind } from '../shared/model';
import { AGENTS, type TurnRequest } from './agents';

const REQUEST: TurnRequest = {
  model: 'model',
  planMode: false,
  readOnly: false,
  effort: 'high',
  fast: false,
  toolApprovals: false,
  resumeId: 'chat-1',
  fork: true,
  newSessionId: 'chat-2',
  systemPrompt: '',
  addDirs: [],
};

describe('forking a chat', () => {
  it.each<[AgentKind, string[]]>([
    ['claude', ['--resume', 'chat-1', '--fork-session']],
    ['codex', ['exec', 'fork']],
  ])('%s continues a copy of the conversation', (agent, expected) => {
    const args = AGENTS[agent].args(REQUEST).join(' ');

    expect(args).toContain(expected.join(' '));
    expect(args).toContain('chat-1');
  });
});
