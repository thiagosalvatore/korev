import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Button } from './Button';

afterEach(cleanup);

describe('Button', () => {
  it('stays busy and disabled until the promise from onClick settles', async () => {
    let finish = () => {};
    render(
      <Button
        onClick={() => new Promise<void>((resolve) => (finish = resolve))}
      >
        Create PR
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Create PR' });

    fireEvent.click(button);
    expect(button).toHaveProperty('disabled', true);
    expect(button.getAttribute('aria-busy')).toBe('true');

    await act(async () => finish());
    expect(button).toHaveProperty('disabled', false);
    expect(button.getAttribute('aria-busy')).toBeNull();
  });
});
