import {
  createCssVariablesTheme,
  createHighlighterCore,
  type HighlighterCore,
  type ThemedToken,
} from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { bundledLanguages, type BundledLanguage } from 'shiki/langs';

const MAX_HIGHLIGHT_CHARS = 200_000;
const THEME_NAME = 'korev';
const THEME = createCssVariablesTheme({
  name: THEME_NAME,
  variablePrefix: '--shiki-',
});

let highlighter: Promise<HighlighterCore> | undefined;

function getHighlighter(): Promise<HighlighterCore> {
  highlighter ??= createHighlighterCore({
    themes: [THEME],
    langs: [],
    engine: createJavaScriptRegexEngine(),
  });
  return highlighter;
}

function isBundledLanguage(name: string): name is BundledLanguage {
  return Object.hasOwn(bundledLanguages, name);
}

function languageOf(file: string): BundledLanguage | null {
  const name = file.split('/').at(-1)?.toLowerCase() ?? '';
  const extension = name.split('.').slice(1).at(-1) ?? '';
  return [extension, name].find(isBundledLanguage) ?? null;
}

export async function highlightFile(
  contents: string,
  file: string,
): Promise<ThemedToken[][] | null> {
  const lang = languageOf(file);
  if (!lang || contents.length > MAX_HIGHLIGHT_CHARS) return null;
  const shiki = await getHighlighter();
  await shiki.loadLanguage(bundledLanguages[lang]);
  return shiki.codeToTokens(contents, { lang, theme: THEME_NAME }).tokens;
}
