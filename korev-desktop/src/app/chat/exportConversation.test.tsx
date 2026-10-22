import { describe, expect, it } from 'vitest';
import type { ChatItem, ChatSession } from '../../shared/model';
import { conversationHtml } from './exportConversation';

const SESSION: ChatSession = {
  id: 'session-1',
  title: 'Fix the <login> page',
  agent: 'claude',
  model: 'opus',
  effort: 'high',
  fast: false,
  planMode: false,
  agentSessionId: null,
  forkOnNextTurn: false,
  createdAt: '2026-10-22T10:00:00.000Z',
};

const ITEMS: ChatItem[] = [
  {
    id: 'u1',
    kind: 'user',
    text: 'Why does **login** fail? <script>alert(1)</script>',
    at: '2026-10-22T10:00:00.000Z',
    checkpoint: null,
  },
  { id: 't1', kind: 'thinking', text: 'secret reasoning' },
  {
    id: 'tool1',
    kind: 'tool',
    name: 'Edit',
    summary: 'src/login.ts',
    detail: '- const ok = false;\n+ const ok = true;',
    output: 'TOKEN=hunter2',
    failed: false,
  },
  { id: 'a1', kind: 'assistant', text: 'Fixed it in `login.ts`.' },
  {
    id: 'u2',
    kind: 'user',
    text: 'not sent yet',
    at: '2026-10-22T10:05:00.000Z',
    checkpoint: null,
    queued: true,
  },
];

describe('conversationHtml', () => {
  it('writes the messages and tool calls, without output, thinking or scripts', () => {
    const html = conversationHtml(SESSION, ITEMS, {
      repo: 'acme',
      branch: 'fix-login',
    });

    expect(html).toContain('<title>Fix the &lt;login&gt; page</title>');
    expect(html).toContain('<strong>login</strong>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('<code>login.ts</code>');
    expect(html).toContain('const ok = true;');
    expect(html).toContain('fix-login');
    expect(html).not.toContain('hunter2');
    expect(html).not.toContain('secret reasoning');
    expect(html).not.toContain('not sent yet');
    expect(html).not.toContain('<script');
  });
});
