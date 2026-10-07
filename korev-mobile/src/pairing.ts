import type { RemotePairing } from '../../korev-desktop/src/shared/model';

const HTTP_PROTOCOLS = new Set(['http:', 'https:']);

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    return HTTP_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function parsePairing(text: string): RemotePairing | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { url, token } = parsed as Record<string, unknown>;
  if (!isHttpUrl(url) || typeof token !== 'string' || !token) return null;
  return { url: url.replace(/\/+$/, ''), token };
}
