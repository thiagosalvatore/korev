import { afterEach, describe, expect, it } from 'vitest';
import { accentTokens, applyAppearance } from './appearance';

const root = document.documentElement;

afterEach(() => {
  root.removeAttribute('style');
  delete root.dataset.theme;
  delete root.dataset.palette;
});

describe('applyAppearance', () => {
  it('sets the mode, the theme preset and the accent tokens', () => {
    applyAppearance(root, {
      light: false,
      palette: 'graphite',
      accent: '#d97757',
    });

    expect(root.dataset.theme).toBe('dark');
    expect(root.dataset.palette).toBe('graphite');
    expect(root.style.getPropertyValue('--accent')).toBe('#d97757');
  });

  it("removes a custom accent so the theme's own accent shows again", () => {
    applyAppearance(root, { light: true, palette: 'korev', accent: '#d97757' });
    applyAppearance(root, { light: true, palette: 'korev', accent: '' });

    expect(root.dataset.theme).toBe('light');
    expect(root.style.getPropertyValue('--accent')).toBe('');
    expect(root.style.getPropertyValue('--accent-text')).toBe('');
  });

  it('ignores an accent that is not a hex color', () => {
    applyAppearance(root, { light: false, palette: 'korev', accent: 'red' });

    expect(root.style.getPropertyValue('--accent')).toBe('');
  });
});

describe('accentTokens', () => {
  it('keeps white text on a saturated accent and uses dark text on a pale one', () => {
    expect(accentTokens('#4a72ff', false)['--fg-on-accent']).toBe('#ffffff');
    expect(accentTokens('#f5e663', false)['--fg-on-accent']).toBe('#0f1217');
  });

  it('lightens accent text in dark mode and darkens it in light mode', () => {
    expect(accentTokens('#808080', false)['--accent-text']).toBe('#a6a6a6');
    expect(accentTokens('#808080', true)['--accent-text']).toBe('#5c5c5c');
  });
});
