import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
});
