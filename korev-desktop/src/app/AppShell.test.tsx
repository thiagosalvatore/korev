import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppShell } from './AppShell';
import { installFakeBridge, installMatchMedia } from './fake-bridge';
import { CONNECTED_AUTH, WATCHING_SETTINGS } from './test-fixtures';

beforeEach(() => installMatchMedia());
afterEach(cleanup);

function renderShell() {
  const fake = installFakeBridge();
  render(<AppShell auth={CONNECTED_AUTH} settings={WATCHING_SETTINGS} />);
  return fake;
}

function viewTitle(): string {
  return screen.getByRole('heading', { level: 1 }).textContent ?? '';
}

describe('AppShell', () => {
  it('switches view on the show-mine app command', () => {
    const { emitCommand } = renderShell();
    expect(viewTitle()).toBe('Review requests');
    act(() => emitCommand('show-mine'));
    expect(viewTitle()).toBe('My PRs');
  });

  it('ignores the ? shortcut while a text field has focus', () => {
    const { emitCommand } = renderShell();
    act(() => emitCommand('show-settings'));
    fireEvent.click(screen.getByRole('button', { name: 'Repositories' }));
    const filter = screen.getByLabelText('Filter repos');
    filter.focus();

    fireEvent.keyDown(filter, { key: '?' });
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.keyDown(document.body, { key: '?' });
    expect(
      screen.getByRole('dialog', { name: 'Keyboard shortcuts' }),
    ).toBeTruthy();
  });
});
