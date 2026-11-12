import type { CSSProperties } from 'react';
import type { DarkTheme, LightTheme } from '../shared/model';

export const DARK_THEMES: { id: DarkTheme; label: string }[] = [
  { id: 'korev', label: 'Korev' },
  { id: 'graphite', label: 'Graphite' },
  { id: 'midnight', label: 'Midnight' },
  { id: 'warm', label: 'Warm' },
];

export const LIGHT_THEMES: { id: LightTheme; label: string }[] = [
  { id: 'korev', label: 'Korev' },
  { id: 'neutral', label: 'Neutral' },
  { id: 'warm', label: 'Warm' },
];

export const ACCENT_SWATCHES: { label: string; color: string }[] = [
  { label: 'Cobalt', color: '#4a72ff' },
  { label: 'Violet', color: '#8b5cf6' },
  { label: 'Pink', color: '#e04f9a' },
  { label: 'Orange', color: '#d97757' },
  { label: 'Green', color: '#2ea66b' },
  { label: 'Teal', color: '#1a9e95' },
  { label: 'Grey', color: '#8a8f98' },
];

type Rgb = [number, number, number];

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];
const DARK_TEXT: Rgb = [15, 18, 23];
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const MIN_UI_CONTRAST = 3;

const ACCENT_PROPERTIES = [
  '--accent',
  '--accent-hover',
  '--accent-press',
  '--accent-text',
  '--accent-subtle',
  '--accent-border',
  '--fg-on-accent',
  '--selection-bg',
  '--diff-hunk-bg',
  '--diff-hunk-fg',
] as const;

export function isAccentColor(value: string): boolean {
  return HEX_COLOR.test(value);
}

function parse(hex: string): Rgb {
  return [1, 3, 5].map((start) =>
    parseInt(hex.slice(start, start + 2), 16),
  ) as Rgb;
}

function toHex(rgb: Rgb): string {
  return `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
}

function mix(color: Rgb, toward: Rgb, amount: number): string {
  return toHex(
    color.map(
      (channel, index) => channel + (toward[index] - channel) * amount,
    ) as Rgb,
  );
}

function alpha([red, green, blue]: Rgb, opacity: number): string {
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

function luminance(rgb: Rgb): number {
  const [red, green, blue] = rgb.map((channel) => {
    const ratio = channel / 255;
    return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

// Korev's own cobalt carries white text at about 4:1, so white stays until it drops under the 3:1 minimum for UI text.
function textOn(rgb: Rgb): string {
  const whiteContrast = 1.05 / (luminance(rgb) + 0.05);
  return whiteContrast >= MIN_UI_CONTRAST ? toHex(WHITE) : toHex(DARK_TEXT);
}

// Hover, press and text steps are mixed toward white on dark and toward black on light, like the hand-picked cobalt steps.
export function accentTokens(
  hex: string,
  light: boolean,
): Record<(typeof ACCENT_PROPERTIES)[number], string> {
  const rgb = parse(hex);
  const text = light ? mix(rgb, BLACK, 0.28) : mix(rgb, WHITE, 0.3);
  return {
    '--accent': toHex(rgb),
    '--accent-hover': light ? mix(rgb, BLACK, 0.12) : mix(rgb, WHITE, 0.15),
    '--accent-press': light ? mix(rgb, BLACK, 0.24) : mix(rgb, BLACK, 0.12),
    '--accent-text': text,
    '--accent-subtle': alpha(rgb, light ? 0.09 : 0.14),
    '--accent-border': alpha(rgb, light ? 0.4 : 0.45),
    '--fg-on-accent': textOn(rgb),
    '--selection-bg': alpha(rgb, light ? 0.22 : 0.35),
    '--diff-hunk-bg': alpha(rgb, light ? 0.08 : 0.07),
    '--diff-hunk-fg': text,
  };
}

export function accentStyle(accent: string, light: boolean): CSSProperties {
  return isAccentColor(accent)
    ? (accentTokens(accent, light) as CSSProperties)
    : {};
}

export function applyAccent(
  root: HTMLElement,
  accent: string,
  light: boolean,
): void {
  if (!isAccentColor(accent)) {
    for (const name of ACCENT_PROPERTIES) root.style.removeProperty(name);
    return;
  }
  for (const [name, value] of Object.entries(accentTokens(accent, light)))
    root.style.setProperty(name, value);
}

export function applyAppearance(
  root: HTMLElement,
  appearance: { light: boolean; palette: string; accent: string },
): void {
  root.dataset.theme = appearance.light ? 'light' : 'dark';
  root.dataset.palette = appearance.palette;
  applyAccent(root, appearance.accent, appearance.light);
}
