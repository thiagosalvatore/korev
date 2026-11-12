import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type Tokens = Record<string, string>;

interface Rgba {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

const TOKENS_PATH = join(__dirname, 'styles', 'tokens.css');
const WCAG_AA_TEXT = 4.5;
const CHANNEL_MAX = 255;
const OPAQUE = 1;
const LINEAR_THRESHOLD = 0.03928;
const LINEAR_SLOPE = 12.92;
const GAMMA_OFFSET = 0.055;
const GAMMA_SCALE = 1.055;
const GAMMA = 2.4;
const LUMINANCE_WEIGHTS = { red: 0.2126, green: 0.7152, blue: 0.0722 };
const FLARE = 0.05;
const MAX_VAR_DEPTH = 10;

const TEXT_TOKENS = ['--fg-1', '--fg-2', '--fg-3'];
const SURFACE_TOKENS = ['--bg-app', '--bg-surface', '--bg-raised'];
const STATUS_TONES = ['danger', 'warning', 'success', 'accent'];
const TINT_BASE = '--bg-surface';
const NEUTRAL_BADGE_TEXT = '--fg-2';
const NEUTRAL_BADGE_SURFACE = '--bg-active';

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function blockBody(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Missing ${selector} block`);
  const open = css.indexOf('{', start);
  return css.slice(open + 1, css.indexOf('}', open));
}

function declarations(body: string): Tokens {
  const pattern = /(--[\w-]+)\s*:\s*([^;]+);/g;
  return Object.fromEntries(
    [...body.matchAll(pattern)].map(([, name, value]) => [name, value.trim()]),
  );
}

function presetIds(css: string, mode: string): string[] {
  const pattern = new RegExp(
    `\\[data-theme='${mode}'\\]\\[data-palette='([\\w-]+)'\\] \\{`,
    'g',
  );
  return [...css.matchAll(pattern)].map(([, id]) => id);
}

function presets(
  css: string,
  mode: string,
  base: Tokens,
): Record<string, Tokens> {
  return Object.fromEntries(
    presetIds(css, mode).map((id) => [
      `${mode} ${id}`,
      {
        ...base,
        ...declarations(
          blockBody(css, `[data-theme='${mode}'][data-palette='${id}']`),
        ),
      },
    ]),
  );
}

function themes(): Record<string, Tokens> {
  const css = stripComments(readFileSync(TOKENS_PATH, 'utf8'));
  const dark = declarations(blockBody(css, "[data-theme='dark']"));
  const light = {
    ...dark,
    ...declarations(blockBody(css, "[data-theme='light']")),
  };
  return {
    dark,
    light,
    ...presets(css, 'dark', dark),
    ...presets(css, 'light', light),
  };
}

function resolve(tokens: Tokens, name: string, depth = 0): string {
  const value = tokens[name];
  if (value === undefined) throw new Error(`Unknown token ${name}`);
  const reference = /^var\((--[\w-]+)\)$/.exec(value);
  if (!reference || depth > MAX_VAR_DEPTH) return value;
  return resolve(tokens, reference[1], depth + 1);
}

function parseHex(hex: string): Rgba {
  const digits =
    hex.length === 4
      ? hex
          .slice(1)
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : hex.slice(1);
  const channel = (index: number) =>
    parseInt(digits.slice(index * 2, index * 2 + 2), 16);
  return {
    red: channel(0),
    green: channel(1),
    blue: channel(2),
    alpha: OPAQUE,
  };
}

function parseRgba(value: string): Rgba {
  const [red, green, blue, alpha = OPAQUE] = value
    .replace(/^rgba?\(|\)$/g, '')
    .split(',')
    .map(Number);
  return { red, green, blue, alpha };
}

function parseColor(value: string): Rgba {
  if (value.startsWith('#')) return parseHex(value);
  if (value.startsWith('rgb')) return parseRgba(value);
  throw new Error(`Unsupported colour ${value}`);
}

function composite(top: Rgba, bottom: Rgba): Rgba {
  const mix = (front: number, back: number) =>
    front * top.alpha + back * (OPAQUE - top.alpha);
  return {
    red: mix(top.red, bottom.red),
    green: mix(top.green, bottom.green),
    blue: mix(top.blue, bottom.blue),
    alpha: OPAQUE,
  };
}

function linear(channel: number): number {
  const ratio = channel / CHANNEL_MAX;
  if (ratio <= LINEAR_THRESHOLD) return ratio / LINEAR_SLOPE;
  return ((ratio + GAMMA_OFFSET) / GAMMA_SCALE) ** GAMMA;
}

function luminance({ red, green, blue }: Rgba): number {
  return (
    LUMINANCE_WEIGHTS.red * linear(red) +
    LUMINANCE_WEIGHTS.green * linear(green) +
    LUMINANCE_WEIGHTS.blue * linear(blue)
  );
}

function contrast(first: Rgba, second: Rgba): number {
  const [light, dark] = [luminance(first), luminance(second)].sort(
    (left, right) => right - left,
  );
  return (light + FLARE) / (dark + FLARE);
}

function color(tokens: Tokens, name: string): Rgba {
  return parseColor(resolve(tokens, name));
}

interface TextPair {
  label: string;
  ratio: number;
}

function solidPair(tokens: Tokens, text: string, surface: string): TextPair {
  return {
    label: `${text} on ${surface}`,
    ratio: contrast(color(tokens, text), color(tokens, surface)),
  };
}

function tintPair(tokens: Tokens, tone: string): TextPair {
  const tint = composite(
    color(tokens, `--${tone}-subtle`),
    color(tokens, TINT_BASE),
  );
  return {
    label: `--${tone}-text on --${tone}-subtle`,
    ratio: contrast(color(tokens, `--${tone}-text`), tint),
  };
}

function textPairs(tokens: Tokens): TextPair[] {
  return [
    ...TEXT_TOKENS.flatMap((text) =>
      SURFACE_TOKENS.map((surface) => solidPair(tokens, text, surface)),
    ),
    ...STATUS_TONES.map((tone) => tintPair(tokens, tone)),
    solidPair(tokens, NEUTRAL_BADGE_TEXT, NEUTRAL_BADGE_SURFACE),
  ];
}

function failingPairs(tokens: Tokens): string[] {
  return textPairs(tokens)
    .filter((pair) => pair.ratio < WCAG_AA_TEXT)
    .map((pair) => `${pair.label}: ${pair.ratio.toFixed(2)}`);
}

describe('token contrast', () => {
  it.each(Object.entries(themes()))(
    '%s theme text pairs meet WCAG AA',
    (_, tokens) => {
      expect(failingPairs(tokens)).toEqual([]);
    },
  );
});
