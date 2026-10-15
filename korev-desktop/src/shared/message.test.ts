import { describe, expect, it } from 'vitest';
import {
  formatAttachments,
  korevMessage,
  messageParts,
  planBlock,
} from './message';

describe('messageParts', () => {
  it('takes a handed-off plan out of the text', () => {
    const text = `Implement the plan below.\n\n${planBlock('# Login page\n\n1. Add the form', 'Planning')}`;

    expect(messageParts(text)).toEqual({
      body: 'Implement the plan below.',
      plans: [
        {
          name: 'login-page.md',
          from: 'Planning',
          markdown: '# Login page\n\n1. Add the form',
        },
      ],
      files: [],
      agentMessages: [],
    });
  });

  it('drops the tab-context header when only plans were under it', () => {
    const text = `Do it\n\nContext from other tabs:\n\n${planBlock('1. Step')}`;

    expect(messageParts(text)).toMatchObject({
      body: 'Do it',
      plans: [{ name: 'plan.md', from: null }],
    });
  });

  it('keeps a transcript reference under the tab-context header', () => {
    const text = `Do it\n\nContext from other tabs:\n\n${planBlock('1. Step')}\n\nChat transcript of the "A" tab (read it): .context/a.md`;

    expect(messageParts(text).body).toBe(
      'Do it\n\nContext from other tabs:\n\nChat transcript of the "A" tab (read it): .context/a.md',
    );
  });

  it('lists attached files and removes them from the text', () => {
    const text = `Look at this${formatAttachments(['.context/attachments/1-shot.png', '/tmp/b.txt'])}`;

    expect(messageParts(text)).toEqual({
      body: 'Look at this',
      plans: [],
      files: ['.context/attachments/1-shot.png', '/tmp/b.txt'],
      agentMessages: [],
    });
  });

  it('leaves a plain message as it is', () => {
    expect(messageParts('Fix the <plan> tag parser')).toEqual({
      body: 'Fix the <plan> tag parser',
      plans: [],
      files: [],
      agentMessages: [],
    });
  });

  it('takes the messages other agents sent out of the text', () => {
    const text = [
      korevMessage(
        'worker of t1',
        'worker_done',
        't1 succeeded.\n\nnotes written',
      ),
      korevMessage('worker of t2', 'question', 'q1: Which API?'),
    ].join('\n\n');

    expect(messageParts(text)).toMatchObject({
      body: '',
      agentMessages: [
        {
          from: 'worker of t1',
          type: 'worker_done',
          body: 't1 succeeded.\n\nnotes written',
        },
        { from: 'worker of t2', type: 'question', body: 'q1: Which API?' },
      ],
    });
  });
});
