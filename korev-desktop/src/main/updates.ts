import { access, constants } from 'node:fs/promises';
import path from 'node:path';
import type { ReleaseInfo } from '../shared/model';

const RELEASES_URL =
  'https://api.github.com/repos/thiagosalvatore/korev/releases';
const LATEST_DOWNLOAD_URL =
  'https://github.com/thiagosalvatore/korev/releases/latest/download';
const RELEASE_TIMEOUT_MS = 10_000;
const TAG_PREFIX = 'v';
const LEADING_TAG_PREFIX = /^v/;
const TRANSLOCATED = '/AppTranslocation/';

export interface Release extends ReleaseInfo {
  url: string;
}

interface GithubRelease {
  tag_name: string;
  body: string | null;
  html_url: string;
}

export function updateFeedUrl(arch: string): string {
  return `${LATEST_DOWNLOAD_URL}/RELEASES-darwin-${arch}.json`;
}

function numericParts(version: string): number[] {
  return version.split('-')[0].split('.').map(Number);
}

function isPrerelease(version: string): boolean {
  return version.includes('-');
}

export function isNewer(candidate: string, current: string): boolean {
  const next = numericParts(candidate);
  const installed = numericParts(current);
  for (let index = 0; index < 3; index++) {
    if (next[index] !== installed[index]) return next[index] > installed[index];
  }
  return isPrerelease(current) && !isPrerelease(candidate);
}

export async function fetchRelease(
  which: 'latest' | string,
): Promise<Release | null> {
  const route = which === 'latest' ? 'latest' : `tags/${TAG_PREFIX}${which}`;
  try {
    const response = await fetch(`${RELEASES_URL}/${route}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Korev' },
      signal: AbortSignal.timeout(RELEASE_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const release = (await response.json()) as GithubRelease;
    return {
      version: release.tag_name.replace(LEADING_TAG_PREFIX, ''),
      notes: release.body ?? '',
      url: release.html_url,
    };
  } catch {
    return null;
  }
}

export async function canReplaceBundle(bundlePath: string): Promise<boolean> {
  if (bundlePath.includes(TRANSLOCATED)) return false;
  try {
    await access(path.dirname(bundlePath), constants.W_OK);
    await access(bundlePath, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}
