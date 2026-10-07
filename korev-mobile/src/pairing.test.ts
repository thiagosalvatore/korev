import { describe, expect, it } from 'vitest';
import { parsePairing } from './pairing';

describe('parsePairing', () => {
  it('reads the code Korev shows in Settings', () => {
    expect(
      parsePairing('{"url":"http://100.101.102.103:7420/","token":"abc"}'),
    ).toEqual({ url: 'http://100.101.102.103:7420', token: 'abc' });
  });

  it.each([
    ['text that is not JSON', 'https://example.com'],
    ['a URL that is not http', '{"url":"file:///etc/passwd","token":"abc"}'],
    ['a missing token', '{"url":"http://100.101.102.103:7420"}'],
    ['an empty token', '{"url":"http://100.101.102.103:7420","token":""}'],
    ['JSON that is not an object', 'null'],
  ])('rejects %s', (_label, text) => {
    expect(parsePairing(text)).toBeNull();
  });
});
