import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getUi, resetUiForTests } from '../ui-store';
import { WideChatButton } from './WideChatButton';

beforeEach(resetUiForTests);
afterEach(cleanup);

describe('WideChatButton', () => {
  it('turns the wide chat on and off', () => {
    render(<WideChatButton />);
    const button = screen.getByRole('button', { name: 'Wide chat' });
    expect(button.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(button);
    expect(getUi().wideChat).toBe(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(button);
    expect(getUi().wideChat).toBe(false);
  });
});
