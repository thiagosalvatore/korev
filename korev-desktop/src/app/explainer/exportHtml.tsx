import { renderToStaticMarkup } from 'react-dom/server';
import type { DiffRow } from '../../shared/diff';
import {
  changedFiles,
  hunksForChange,
  uncoveredFiles,
  type ExplainerContent,
  type ExplainerRef,
  type FilePatch,
} from '../../shared/explainer';
import { richSegments, type GlossaryEntry } from './glossary';

const STYLES = `
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
abbr { text-decoration: underline dotted; text-underline-offset: 4px; cursor: help; }
.meta { color: var(--fg-3); font-size: 13px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 20px; }
.overline { display: block; margin-bottom: 6px; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--fg-3); }
.headline { font-size: 20px; font-weight: 600; line-height: 1.35; }
.muted { color: var(--fg-2); }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.after { background: var(--accent-subtle); border-color: var(--accent-border); }
.after .overline, .accent { color: var(--accent); }
.flow { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
.flow li { display: flex; gap: 12px; }
.number { flex: none; width: 22px; height: 22px; border-radius: 50%; background: var(--inset); color: var(--fg-2); font-size: 12px; font-weight: 600; display: flex; align-items: center; justify-content: center; }
details { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; margin-bottom: 8px; }
summary { padding: 12px 16px; cursor: pointer; display: flex; gap: 12px; align-items: center; list-style: none; }
summary::after { content: '›'; margin-left: auto; color: var(--fg-3); font-size: 18px; transition: transform 0.1s; }
details[open] > summary::after { transform: rotate(90deg); }
.step { padding: 0 16px 16px 50px; display: flex; flex-direction: column; gap: 12px; }
.why { background: var(--accent-subtle); border-radius: 8px; padding: 10px 12px; }
.code { border: 1px solid var(--border); border-radius: 8px; overflow: auto; }
.code-file { padding: 6px 10px; font: 12px ui-monospace, Menlo, monospace; border-bottom: 1px solid var(--border); color: var(--fg-2); }
table { border-collapse: collapse; width: 100%; font: 12px/20px ui-monospace, SFMono-Regular, Menlo, monospace; }
td { padding: 0 8px; white-space: pre; vertical-align: top; }
td.num, td.sign { width: 1%; color: var(--fg-3); user-select: none; }
td.num { text-align: right; }
tr.add { background: var(--add-bg); } tr.add td.sign { color: var(--add-fg); }
tr.del { background: var(--del-bg); } tr.del td.sign { color: var(--del-fg); }
tr.hunk { background: var(--hunk-bg); color: var(--accent); }
.risks { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
.risk { border-left: 3px solid; border-radius: 8px; padding: 10px 14px; }
.risk-high { border-color: var(--high); background: var(--high-subtle); }
.risk-medium { border-color: var(--medium); background: var(--medium-subtle); }
.risk-low { border-color: var(--low); background: var(--low-subtle); }
.level { font-size: 11px; font-weight: 700; text-transform: uppercase; margin-right: 8px; }
.warning { background: var(--warning-subtle); border-radius: 8px; padding: 10px 14px; }
.warning strong { color: var(--warning); }
.mono { font: 12px ui-monospace, Menlo, monospace; }
dl { display: grid; grid-template-columns: minmax(120px, auto) 1fr; gap: 6px 16px; margin: 0; }
dt { font-weight: 600; } dd { margin: 0; color: var(--fg-2); }
footer { color: var(--fg-3); font-size: 12px; text-align: center; }
`;

const SIGNS: Record<DiffRow['type'], string> = {
  add: '+',
  del: '−',
  ctx: ' ',
  hunk: '',
};

function Text({ text, glossary }: { text: string; glossary: GlossaryEntry[] }) {
  return text
    .split(/\n{2,}/)
    .filter((paragraph) => paragraph.trim())
    .map((paragraph, index) => (
      <p key={index}>
        {richSegments(paragraph, glossary).map((segment, part) => {
          if (segment.kind === 'code')
            return <code key={part}>{segment.text}</code>;
          if (segment.kind === 'term')
            return (
              <abbr key={part} title={segment.meaning}>
                {segment.text}
              </abbr>
            );
          return segment.text;
        })}
      </p>
    ));
}

function Rows({ rows }: { rows: DiffRow[] }) {
  return (
    <table>
      <tbody>
        {rows.map((row, index) =>
          row.type === 'hunk' ? (
            <tr key={index} className="hunk">
              <td colSpan={4}>{row.code}</td>
            </tr>
          ) : (
            <tr key={index} className={row.type}>
              <td className="num">{row.oldLine ?? ''}</td>
              <td className="num">{row.newLine ?? ''}</td>
              <td className="sign">{SIGNS[row.type]}</td>
              <td>{row.code}</td>
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function ExplainerDocument({
  explainerRef,
  content,
  patch,
}: {
  explainerRef: ExplainerRef;
  content: ExplainerContent;
  patch: string;
}) {
  const { glossary } = content;
  const files = new Map<string, FilePatch>(
    changedFiles(patch).map((file) => [file.path, file]),
  );
  const missing = uncoveredFiles(content, patch);
  const number =
    explainerRef.target.kind === 'pr'
      ? `#${explainerRef.target.number} · `
      : '';
  return (
    <main>
      <header>
        <span className="meta">
          {number}
          {explainerRef.author ? `@${explainerRef.author} · ` : ''}
          {files.size} {files.size === 1 ? 'file' : 'files'}
          {explainerRef.url ? (
            <>
              {' · '}
              <a href={explainerRef.url}>Open on GitHub</a>
            </>
          ) : null}
        </span>
        <h1>{explainerRef.title}</h1>
      </header>
      <div className="card">
        <span className="overline accent">In one sentence</span>
        <div className="headline">
          <Text text={content.headline} glossary={glossary} />
        </div>
        <div className="muted">
          <Text text={content.summary} glossary={glossary} />
        </div>
      </div>
      <div className="pair">
        <div className="card">
          <span className="overline">Before</span>
          <Text text={content.before} glossary={glossary} />
        </div>
        <div className="card after">
          <span className="overline">After</span>
          <Text text={content.after} glossary={glossary} />
        </div>
      </div>
      {content.flow.length ? (
        <Section title="How it works">
          <ol className="flow">
            {content.flow.map((stage, index) => (
              <li key={index}>
                <span className="number">{index + 1}</span>
                <div>
                  <strong>{stage.label}</strong>
                  <div className="muted">
                    <Text text={stage.detail} glossary={glossary} />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}
      <Section title="Walkthrough">
        {content.tour.map((step, index) => (
          <details key={index} open={index === 0}>
            <summary>
              <span className="number">{index + 1}</span>
              <h3>{step.title}</h3>
            </summary>
            <div className="step">
              <div>
                <Text text={step.explanation} glossary={glossary} />
              </div>
              {step.why.trim() ? (
                <div className="why">
                  <strong className="accent">Why. </strong>
                  <Text text={step.why} glossary={glossary} />
                </div>
              ) : null}
              {step.changes.map((change, part) => {
                const file = files.get(change.file);
                const rows = file ? hunksForChange(file, change) : [];
                return (
                  <div key={part} className="code">
                    <div className="code-file">{change.file}</div>
                    {rows.length ? <Rows rows={rows} /> : null}
                  </div>
                );
              })}
            </div>
          </details>
        ))}
      </Section>
      {content.risks.length ? (
        <Section title="Look closely">
          <ul className="risks">
            {content.risks.map((risk, index) => (
              <li key={index} className={`risk risk-${risk.level}`}>
                <span className="level">{risk.level}</span>
                <strong>{risk.title}</strong>
                <div className="muted">
                  <Text text={risk.explanation} glossary={glossary} />
                </div>
                {risk.file ? <span className="mono">{risk.file}</span> : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {content.questions.length ? (
        <Section title="Questions for the author">
          <ul>
            {content.questions.map((question, index) => (
              <li key={index}>{question}</li>
            ))}
          </ul>
        </Section>
      ) : null}
      {missing.length || content.routine.length ? (
        <Section title="Other files">
          {missing.length ? (
            <div className="warning">
              <strong>Not explained.</strong> The explanation does not mention
              these changed files:{' '}
              <span className="mono">{missing.join(', ')}</span>
            </div>
          ) : null}
          <ul>
            {content.routine.map((entry) => (
              <li key={entry.file}>
                <span className="mono">{entry.file}</span>{' '}
                <span className="muted">{entry.reason}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {glossary.length ? (
        <Section title="Words used here">
          <dl>
            {glossary.map((entry) => (
              <div key={entry.term} style={{ display: 'contents' }}>
                <dt>{entry.term}</dt>
                <dd>{entry.meaning}</dd>
              </div>
            ))}
          </dl>
        </Section>
      ) : null}
      <footer>Explained with Korev</footer>
    </main>
  );
}

export function explainerHtml(
  explainerRef: ExplainerRef,
  content: ExplainerContent,
  patch: string,
): string {
  const body = renderToStaticMarkup(
    <ExplainerDocument
      explainerRef={explainerRef}
      content={content}
      patch={patch}
    />,
  );
  const title = renderToStaticMarkup(<title>{explainerRef.title}</title>);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${title}<style>${STYLES}</style></head><body>${body}</body></html>`;
}

function fileName(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug || 'explanation'}.html`;
}

export function downloadExplainer(
  explainerRef: ExplainerRef,
  content: ExplainerContent,
  patch: string,
) {
  const html = explainerHtml(explainerRef, content, patch);
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName(explainerRef.title);
  link.click();
  URL.revokeObjectURL(url);
}
