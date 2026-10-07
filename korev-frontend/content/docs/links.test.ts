import { existsSync, globSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DOCS_DIR = 'content/docs';
const MDX_LINK = /\]\((?!https?:)([^)#]+\.mdx)(?:#[^)]*)?\)/g;
const FILE_RELATIVE = /^\.\.?\//;

function mdxLinks() {
  return globSync('**/*.mdx', { cwd: DOCS_DIR }).flatMap((page) =>
    [...readFileSync(join(DOCS_DIR, page), 'utf8').matchAll(MDX_LINK)].map(
      ([, href]) => ({ page, href }),
    ),
  );
}

describe('docs links', () => {
  it('start with ./ or ../ and point at pages that exist', () => {
    const links = mdxLinks();
    expect(links.length).toBeGreaterThan(0);
    const broken = links.filter(
      ({ page, href }) =>
        !FILE_RELATIVE.test(href) ||
        !existsSync(join(DOCS_DIR, dirname(page), href)),
    );
    expect(broken).toEqual([]);
  });
});
