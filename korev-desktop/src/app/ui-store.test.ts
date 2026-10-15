import { describe, expect, it, vi } from 'vitest';

describe('ui store', () => {
  it('opens the Changes tab when the saved panel tab no longer exists', async () => {
    localStorage.setItem('korev:ui', JSON.stringify({ gitTab: 'checks' }));
    vi.resetModules();

    const { getUi } = await import('./ui-store');

    expect(getUi().gitTab).toBe('changes');
  });
});
