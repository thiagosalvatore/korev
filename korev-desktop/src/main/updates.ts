import { execFile } from 'node:child_process';
import {
  access,
  constants,
  mkdtemp,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { ReleaseInfo } from '../shared/model';

const RELEASES_URL =
  'https://api.github.com/repos/thiagosalvatore/korev/releases';
const RELEASE_TIMEOUT_MS = 10_000;
const DOWNLOAD_TIMEOUT_MS = 10 * 60_000;
const TAG_PREFIX = 'v';
const LEADING_TAG_PREFIX = /^v/;
const BUNDLE_NAME = 'Korev.app';
const ZIP_NAME = 'Korev.zip';
const TRANSLOCATED = '/AppTranslocation/';
const STAGING_SUFFIX = '.update';
const BACKUP_SUFFIX = '.old';

export interface Release extends ReleaseInfo {
  url: string;
  zipUrl: string | null;
}

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface GithubRelease {
  tag_name: string;
  body: string | null;
  html_url: string;
  assets: ReleaseAsset[];
}

export function pickZipAsset(
  assets: ReleaseAsset[],
  arch: string,
): ReleaseAsset | null {
  return (
    assets.find(
      (asset) =>
        asset.name.endsWith('.zip') && asset.name.includes(`darwin-${arch}`),
    ) ?? null
  );
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
      zipUrl:
        pickZipAsset(release.assets, process.arch)?.browser_download_url ??
        null,
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

async function download(url: string, target: string) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok)
    throw new Error(`Download failed with status ${response.status}`);
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
}

async function swapBundle(bundlePath: string, replacement: string) {
  const backup = `${bundlePath}${BACKUP_SUFFIX}`;
  await rm(backup, { recursive: true, force: true });
  await rename(bundlePath, backup);
  try {
    await rename(replacement, bundlePath);
  } catch (error) {
    await rename(backup, bundlePath);
    throw error;
  }
  await rm(backup, { recursive: true, force: true });
}

export async function replaceBundle(zipUrl: string, bundlePath: string) {
  const downloadDir = await mkdtemp(path.join(tmpdir(), 'korev-update-'));
  const staging = `${bundlePath}${STAGING_SUFFIX}`;
  try {
    const zip = path.join(downloadDir, ZIP_NAME);
    await download(zipUrl, zip);
    await rm(staging, { recursive: true, force: true });
    await promisify(execFile)('ditto', ['-x', '-k', zip, staging]);
    await swapBundle(bundlePath, path.join(staging, BUNDLE_NAME));
  } finally {
    await rm(downloadDir, { recursive: true, force: true });
    await rm(staging, { recursive: true, force: true });
  }
}
