import type { ISearchOptions } from '@xterm/addon-search';
import type { ITheme } from '@xterm/xterm';

type FindDecorations = NonNullable<ISearchOptions['decorations']>;

function token(styles: CSSStyleDeclaration, name: string): string {
  return styles.getPropertyValue(name).trim();
}

function rootStyles(): CSSStyleDeclaration {
  return getComputedStyle(document.documentElement);
}

export function themeFromTokens(): { theme: ITheme; fontFamily: string } {
  const styles = rootStyles();
  return {
    theme: {
      background: token(styles, '--bg-inset'),
      foreground: token(styles, '--fg-1'),
      cursor: token(styles, '--accent'),
      selectionBackground: token(styles, '--selection-bg'),
    },
    fontFamily: token(styles, '--font-mono'),
  };
}

export function findDecorations(): FindDecorations {
  const styles = rootStyles();
  const match = token(styles, '--warning');
  const active = token(styles, '--accent');
  return {
    matchBorder: match,
    matchOverviewRuler: match,
    activeMatchBorder: active,
    activeMatchColorOverviewRuler: active,
  };
}
