import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ICON_MAX_BYTES = 256 * 1024;

const ICON_DIRS = [
  '',
  'public',
  'static',
  'app',
  'src',
  'src/app',
  'assets',
  'frontend/public',
  'web/public',
  'apps/web/public',
];
const ICON_FILES = ['favicon.svg', 'favicon.png', 'favicon.ico', 'icon.svg'];

const MIME_TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const CANDIDATES = ICON_DIRS.flatMap((dir) =>
  ICON_FILES.map((file) => path.join(dir, file)),
);

async function readIcon(file: string): Promise<string | null> {
  const info = await stat(file).catch(() => null);
  if (!info?.isFile() || info.size > ICON_MAX_BYTES) return null;
  const contents = await readFile(file);
  const mime = MIME_TYPES[path.extname(file)];
  return `data:${mime};base64,${contents.toString('base64')}`;
}

export async function repoFavicon(repo: string): Promise<string | null> {
  for (const candidate of CANDIDATES) {
    const icon = await readIcon(path.join(repo, candidate));
    if (icon) return icon;
  }
  return null;
}
