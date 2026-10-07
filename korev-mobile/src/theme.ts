import { Platform, useColorScheme } from 'react-native';

const DARK = {
  bgApp: '#0b0d10',
  bgSurface: '#101317',
  bgRaised: '#151920',
  bgHover: '#1b2028',
  bgActive: '#232933',
  border1: '#1e232b',
  border2: '#2a303a',
  fg1: '#f5f6f8',
  fg2: '#a2aab8',
  fg3: '#7d8696',
  fg4: '#5a6372',
  fgOnAccent: '#ffffff',
  accent: '#4a72ff',
  accentText: '#7393ff',
  accentSubtle: 'rgba(74, 114, 255, 0.14)',
  accentPress: '#2f5bea',
  success: '#3fb97a',
  successText: '#5bd08f',
  danger: '#f0584f',
  dangerText: '#ff7a70',
  warning: '#e3b341',
  warningText: '#f0c865',
  merged: '#a371f7',
  diffAdd: '#5bd08f',
  diffDel: '#ff7a70',
};

export type Theme = typeof DARK;

const LIGHT: Theme = {
  ...DARK,
  bgApp: '#f7f8fa',
  bgSurface: '#ffffff',
  bgRaised: '#ffffff',
  bgHover: '#f0f2f5',
  bgActive: '#e7eaef',
  border1: '#e6e9ee',
  border2: '#d7dbe2',
  fg1: '#0f1217',
  fg2: '#4a5260',
  fg3: '#646c7a',
  fg4: '#9aa1ad',
  accent: '#2f5bea',
  accentText: '#2346b8',
  accentSubtle: 'rgba(47, 91, 234, 0.09)',
  accentPress: '#1b3485',
  successText: '#1f7a4d',
  dangerText: '#b4302a',
  warningText: '#8e6b12',
  diffAdd: '#1f7a4d',
  diffDel: '#b4302a',
};

export const MONO_FONT = Platform.select({
  ios: 'Menlo',
  default: 'monospace',
});

export function useTheme(): Theme {
  return useColorScheme() === 'light' ? LIGHT : DARK;
}
