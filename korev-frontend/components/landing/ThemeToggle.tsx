'use client';

import { useEffect, useLayoutEffect } from 'react';
import { Moon, Sun } from 'lucide-react';
import { THEME_STORAGE_KEY } from './theme';

function storedTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function flipTheme() {
  const root = document.documentElement;
  const next = root.dataset.theme === 'light' ? 'dark' : 'light';
  root.dataset.theme = next;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {}
}

function isToggleShortcut(e: KeyboardEvent) {
  return e.metaKey && e.altKey && (e.key === 't' || e.key === '†');
}

export function ThemeToggle() {
  useLayoutEffect(() => {
    const theme = storedTheme();
    if (theme) document.documentElement.dataset.theme = theme;
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isToggleShortcut(e)) return;
      e.preventDefault();
      flipTheme();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  return (
    <button
      className="lp-theme"
      onClick={flipTheme}
      aria-label="Toggle theme"
      title="Toggle theme (⌘⌥T)"
    >
      <Sun size={15} className="sun" />
      <Moon size={15} className="moon" />
    </button>
  );
}
