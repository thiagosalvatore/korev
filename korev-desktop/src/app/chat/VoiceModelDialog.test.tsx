import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DictationStatus } from '../../shared/model';
import { VoiceModelDialog } from './VoiceModelDialog';

afterEach(cleanup);

function renderDialog(status: DictationStatus) {
  const handlers = { onDownload: vi.fn(), onStart: vi.fn(), onClose: vi.fn() };
  render(<VoiceModelDialog status={status} {...handlers} />);
  return handlers;
}

describe('VoiceModelDialog', () => {
  it('asks before downloading a missing model', () => {
    const { onDownload } = renderDialog({ status: 'missing' });

    expect(screen.getByRole('dialog').textContent).toContain('550 MB');
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    expect(onDownload).toHaveBeenCalledOnce();
  });

  it('shows download progress without offering another download', () => {
    renderDialog({ status: 'downloading', progress: 42 });

    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe(
      '42',
    );
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull();
  });

  it('shows the error and retries a failed download', () => {
    const { onDownload } = renderDialog({
      status: 'failed',
      error: 'HTTP 503',
    });

    expect(screen.getByRole('dialog').textContent).toContain('HTTP 503');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(onDownload).toHaveBeenCalledOnce();
  });

  it('starts voice input once the model is ready', () => {
    const { onStart } = renderDialog({ status: 'ready' });

    fireEvent.click(screen.getByRole('button', { name: 'Start voice input' }));

    expect(onStart).toHaveBeenCalledOnce();
  });
});
