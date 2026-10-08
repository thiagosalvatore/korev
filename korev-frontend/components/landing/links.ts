export const GITHUB_OWNER = 'thiagosalvatore';
export const GITHUB_REPO = 'korev';
export const GITHUB_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;
export const DOCS_URL = '/docs';
export const RELEASES_URL = `${GITHUB_URL}/releases`;
export const SHORTCUTS_URL = `${DOCS_URL}/reference/keyboard-shortcuts`;
export const ROADMAP_URL = `${GITHUB_URL}/blob/main/TODOS.md`;
export const LATEST_DOWNLOAD_URL = `${RELEASES_URL}/latest/download`;

export type MacArch = 'arm64' | 'x64';

export function dmgUrl(arch: MacArch): string {
  return `${LATEST_DOWNLOAD_URL}/Korev-${arch}.dmg`;
}
