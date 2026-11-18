import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dateTime } from '../../shared/format';
import type { ChatItem } from '../../shared/model';
import { Transcript } from './Transcript';

afterEach(cleanup);

function tool(id: string, name: string, parentToolId?: string): ChatItem {
  return {
    id,
    kind: 'tool',
    name,
    summary: `${name} summary`,
    detail: '',
    output: 'ok',
    failed: false,
    parentToolId,
  };
}

describe('Transcript', () => {
  it('folds sub-agent tool calls under their Task until opened', () => {
    render(
      <Transcript
        sessionId="session-1"
        items={[
          tool('task-1', 'Task'),
          tool('sub-1', 'Grep', 'task-1'),
          tool('sub-2', 'Bash', 'task-1'),
        ]}
        running={false}
        empty={null}
        onRevert={vi.fn()}
        onRespond={vi.fn()}
        onRetry={vi.fn()}
        onOpenTurnFile={vi.fn()}
      />,
    );

    expect(screen.getByText('Task')).toBeTruthy();
    expect(screen.queryByText('Grep')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /2 tool calls/ }));

    expect(screen.getByText('Grep')).toBeTruthy();
    expect(screen.getByText('Bash')).toBeTruthy();
  });

  it('shows when a message was sent and when its turn finished', () => {
    const sentAt = '2026-10-28T09:05:00.000Z';
    const finishedAt = '2026-10-28T09:07:30.000Z';
    render(
      <Transcript
        sessionId="session-1"
        items={[
          {
            id: 'user-1',
            kind: 'user',
            text: 'Add a note',
            at: sentAt,
            checkpoint: null,
          },
          {
            id: 'result-1',
            kind: 'result',
            ok: true,
            text: '',
            durationMs: 150_000,
            costUsd: 0.42,
            at: finishedAt,
          },
        ]}
        running={false}
        empty={null}
        onRevert={vi.fn()}
        onRespond={vi.fn()}
        onRetry={vi.fn()}
        onOpenTurnFile={vi.fn()}
      />,
    );

    expect(screen.getByText(dateTime(sentAt))).toBeTruthy();
    expect(
      screen.getByText(`Completed in 2m 30s · $0.42 · ${dateTime(finishedAt)}`),
    ).toBeTruthy();
  });

  it('labels the messages Korev sent', () => {
    const at = '2026-10-28T09:05:00.000Z';
    render(
      <Transcript
        sessionId="session-1"
        items={[
          { id: 'user-1', kind: 'user', text: 'Mine', at, checkpoint: null },
          {
            id: 'user-2',
            kind: 'user',
            text: 'Fix the checks',
            at,
            checkpoint: null,
            fromKorev: true,
          },
        ]}
        running={false}
        empty={null}
        onRevert={vi.fn()}
        onRespond={vi.fn()}
        onRetry={vi.fn()}
        onOpenTurnFile={vi.fn()}
      />,
    );

    expect(screen.getAllByText('Korev')).toHaveLength(1);
    expect(screen.getByLabelText('Sent by Korev').textContent).toContain(
      'Fix the checks',
    );
  });

  function renderAnswer(wide: boolean) {
    render(
      <Transcript
        sessionId="session-1"
        items={[{ id: 'assistant-1', kind: 'assistant', text: 'Hello' }]}
        running={false}
        empty={null}
        onRevert={vi.fn()}
        onRespond={vi.fn()}
        onRetry={vi.fn()}
        onOpenTurnFile={vi.fn()}
        wide={wide}
      />,
    );
    return screen.getByText('Hello');
  }

  it('keeps answers at reading width and lets their tables grow past it', () => {
    const answer = renderAnswer(false);

    expect(answer.closest('.max-w-\\[820px\\]')).toBeTruthy();
    expect(answer.closest('.kv-chat')).toBeTruthy();
    expect(answer.closest('.kv-md-breakout')).toBeTruthy();
  });

  it('fills the pane when the chat is wide', () => {
    const answer = renderAnswer(true);

    expect(answer.closest('.max-w-\\[820px\\]')).toBeNull();
    expect(answer.closest('.kv-chat')).toBeNull();
  });
});
