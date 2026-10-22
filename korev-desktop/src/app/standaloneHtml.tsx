import { renderToStaticMarkup } from 'react-dom/server';

export const BASE_STYLES = `
:root {
  color-scheme: light dark;
  --bg: #f7f8fa; --surface: #ffffff; --inset: #f3f4f7; --border: #e6e9ee;
  --fg-1: #0f1217; --fg-2: #4a5260; --fg-3: #646c7a;
  --accent: #2346b8; --accent-subtle: rgba(47, 91, 234, 0.09); --accent-border: rgba(47, 91, 234, 0.4);
  --add-bg: #ebf8f0; --add-fg: #1f7a4d; --del-bg: #fdeeed; --del-fg: #b4302a; --hunk-bg: #eef2ff;
  --warning: #8e6b12; --warning-subtle: rgba(227, 179, 65, 0.13);
  --high: #f28a3c; --high-subtle: rgba(242, 138, 60, 0.14);
  --medium: #e3b341; --medium-subtle: rgba(227, 179, 65, 0.13);
  --low: #7d8696; --low-subtle: rgba(125, 134, 150, 0.14);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0b0d10; --surface: #101317; --inset: #08090c; --border: #1e232b;
    --fg-1: #f5f6f8; --fg-2: #a2aab8; --fg-3: #7d8696;
    --accent: #7393ff; --accent-subtle: rgba(74, 114, 255, 0.14); --accent-border: rgba(74, 114, 255, 0.45);
    --add-bg: rgba(63, 185, 122, 0.09); --add-fg: #5bd08f; --del-bg: rgba(240, 88, 79, 0.09); --del-fg: #ff7a70; --hunk-bg: rgba(74, 114, 255, 0.07);
    --warning: #f0c865;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg-1); font: 15px/1.6 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
main { max-width: 860px; margin: 0 auto; padding: 40px 24px 64px; display: flex; flex-direction: column; gap: 32px; }
h1 { margin: 4px 0 0; font-size: 24px; line-height: 1.25; }
h2 { margin: 0 0 12px; font-size: 16px; }
h3 { margin: 0; font-size: 15px; display: inline; }
p { margin: 0 0 8px; }
p:last-child { margin-bottom: 0; }
code { font: 0.9em ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--inset); border-radius: 4px; padding: 0 4px; }
.meta { color: var(--fg-3); font-size: 13px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 20px; }
.overline { display: block; margin-bottom: 6px; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--fg-3); }
.muted { color: var(--fg-2); }
details { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; margin-bottom: 8px; }
summary { padding: 12px 16px; cursor: pointer; display: flex; gap: 12px; align-items: center; list-style: none; }
summary::after { content: '›'; margin-left: auto; color: var(--fg-3); font-size: 18px; transition: transform 0.1s; }
details[open] > summary::after { transform: rotate(90deg); }
table { border-collapse: collapse; width: 100%; font: 12px/20px ui-monospace, SFMono-Regular, Menlo, monospace; }
td { padding: 0 8px; white-space: pre; vertical-align: top; }
td.num, td.sign { width: 1%; color: var(--fg-3); user-select: none; }
td.num { text-align: right; }
tr.add { background: var(--add-bg); } tr.add td.sign { color: var(--add-fg); }
tr.del { background: var(--del-bg); } tr.del td.sign { color: var(--del-fg); }
tr.hunk { background: var(--hunk-bg); color: var(--accent); }
.mono { font: 12px ui-monospace, Menlo, monospace; }
footer { color: var(--fg-3); font-size: 12px; text-align: center; }
`;

const CONTENT_SECURITY_POLICY =
  "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:";

export function standalonePage(
  title: string,
  styles: string,
  body: React.ReactElement,
): string {
  const head = renderToStaticMarkup(
    <>
      <meta charSet="utf-8" />
      <meta
        httpEquiv="Content-Security-Policy"
        content={CONTENT_SECURITY_POLICY}
      />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title}</title>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
    </>,
  );
  return `<!doctype html><html lang="en"><head>${head}</head><body>${renderToStaticMarkup(body)}</body></html>`;
}

function htmlFileName(title: string, fallback: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug || fallback}.html`;
}

export function downloadHtml(title: string, fallback: string, html: string) {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = htmlFileName(title, fallback);
  link.click();
  URL.revokeObjectURL(url);
}
