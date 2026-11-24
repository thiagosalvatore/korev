import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { QueuedMessages } from './QueuedMessages';

afterEach(cleanup);

it('sends a queued message now or removes it', () => {
  const onSendNow = vi.fn();
  const onRemove = vi.fn();
  render(
    <QueuedMessages
      messages={[
        {
          id: 'user-1',
          kind: 'user',
          text: 'Also add tests',
          at: '2026-10-28T09:05:00.000Z',
          checkpoint: null,
          queued: true,
        },
      ]}
      onSendNow={onSendNow}
      onRemove={onRemove}
    />,
  );

  expect(screen.getByText('Also add tests')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Send now' }));
  fireEvent.click(
    screen.getByRole('button', { name: 'Remove queued message' }),
  );

  expect(onSendNow).toHaveBeenCalledWith('user-1');
  expect(onRemove).toHaveBeenCalledWith('user-1');
});
