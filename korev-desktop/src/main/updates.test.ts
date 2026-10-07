import { describe, expect, it } from 'vitest';
import { isNewer, pickZipAsset } from './updates';

describe('isNewer', () => {
  it('compares each part as a number', () => {
    expect(isNewer('1.10.0', '1.9.0')).toBe(true);
    expect(isNewer('1.9.0', '1.10.0')).toBe(false);
  });

  it('is false for the same version', () => {
    expect(isNewer('1.2.3', '1.2.3')).toBe(false);
  });

  it('offers the final release to someone on its release candidate', () => {
    expect(isNewer('1.0.0', '1.0.0-rc.1')).toBe(true);
  });
});

describe('pickZipAsset', () => {
  const asset = (name: string) => ({
    name,
    browser_download_url: `https://example.com/${name}`,
  });
  const assets = [
    asset('Korev-1.2.0-arm64.dmg'),
    asset('Korev-darwin-x64-1.2.0.zip'),
    asset('Korev-darwin-arm64-1.2.0.zip'),
  ];

  it('picks the zip built for this architecture', () => {
    expect(pickZipAsset(assets, 'arm64')?.name).toBe(
      'Korev-darwin-arm64-1.2.0.zip',
    );
  });

  it('finds nothing when the release has no zip for this architecture', () => {
    expect(pickZipAsset(assets, 'ia32')).toBeNull();
  });
});
