import { describe, expect, it } from 'vitest';
import { richSegments } from './glossary';

const GLOSSARY = [
  { term: 'cache', meaning: 'A saved copy.' },
  { term: 'cache key', meaning: 'The name a copy is saved under.' },
  { term: 'C++', meaning: 'A language.' },
];

describe('richSegments', () => {
  it('marks glossary terms, the longest first, and code in backticks', () => {
    expect(
      richSegments(
        'The Cache key comes from `userId`, not the cache.',
        GLOSSARY,
      ),
    ).toEqual([
      { kind: 'text', text: 'The ' },
      {
        kind: 'term',
        text: 'Cache key',
        meaning: 'The name a copy is saved under.',
      },
      { kind: 'text', text: ' comes from ' },
      { kind: 'code', text: 'userId' },
      { kind: 'text', text: ', not the ' },
      { kind: 'term', text: 'cache', meaning: 'A saved copy.' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('matches whole words only and escapes terms with symbols', () => {
    expect(richSegments('Caches use C++.', GLOSSARY)).toEqual([
      { kind: 'text', text: 'Caches use ' },
      { kind: 'term', text: 'C++', meaning: 'A language.' },
      { kind: 'text', text: '.' },
    ]);
  });
});
