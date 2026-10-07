export function screenshotPath(name: string, theme: 'dark' | 'light') {
  return `/screenshots/${name}-${theme}.png`;
}
