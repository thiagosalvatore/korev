import { existsSync, globSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DOCS_DIR = 'content/docs';
const MDX_LINK = /\]\((?!https?:)([^)#]+\.mdx)(?:#[^)]*)?\)/g;
const FILE_RELATIVE = /^\.\.?\//;
const DOCS_HREF = /href="\/docs\/?([^"#]*)"/g;

function pages() {
  return globSync('**/*.mdx', { cwd: DOCS_DIR }).map((page) => ({
    page,
    text: readFileSync(join(DOCS_DIR, page), 'utf8'),
  }));
}

function pageExistsAt(urlPath: string) {
  return [`${urlPath}.mdx`, join(urlPath, 'index.mdx')].some((file) =>
    existsSync(join(DOCS_DIR, file)),
  );
}

describe('docs links', () => {
  it('start with ./ or ../ and point at pages that exist', () => {
    const links = pages().flatMap(({ page, text }) =>
      [...text.matchAll(MDX_LINK)].map(([, href]) => ({ page, href })),
    );
    expect(links.length).toBeGreaterThan(0);
    const broken = links.filter(
      ({ page, href }) =>
        !FILE_RELATIVE.test(href) ||
        !existsSync(join(DOCS_DIR, dirname(page), href)),
    );
    expect(broken).toEqual([]);
  });

  it('card hrefs point at pages that exist', () => {
    const hrefs = pages().flatMap(({ page, text }) =>
      [...text.matchAll(DOCS_HREF)].map(([, urlPath]) => ({ page, urlPath })),
    );
    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.filter(({ urlPath }) => !pageExistsAt(urlPath))).toEqual([]);
  });
});
