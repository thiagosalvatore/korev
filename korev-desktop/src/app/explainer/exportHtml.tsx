import type { DiffRow } from '../../shared/diff';
import {
  changedFiles,
  findFilePatch,
  hunksForChange,
  uncoveredFiles,
  type ExplainerContent,
  type ExplainerRef,
} from '../../shared/explainer';
import { richSegments, type GlossaryEntry } from '../../shared/glossary';
import { BASE_STYLES, downloadHtml, standalonePage } from '../standaloneHtml';

const STYLES = `${BASE_STYLES}
abbr { text-decoration: underline dotted; text-underline-offset: 4px; cursor: help; }
.headline { font-size: 20px; font-weight: 600; line-height: 1.35; }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.after { background: var(--accent-subtle); border-color: var(--accent-border); }
.after .overline, .accent { color: var(--accent); }
.flow { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
.flow li { display: flex; gap: 12px; }
.number { flex: none; width: 22px; height: 22px; border-radius: 50%; background: var(--inset); color: var(--fg-2); font-size: 12px; font-weight: 600; display: flex; align-items: center; justify-content: center; }
.step { padding: 0 16px 16px 50px; display: flex; flex-direction: column; gap: 12px; }
.why { background: var(--accent-subtle); border-radius: 8px; padding: 10px 12px; }
.code { border: 1px solid var(--border); border-radius: 8px; overflow: auto; }
.code-file { padding: 6px 10px; font: 12px ui-monospace, Menlo, monospace; border-bottom: 1px solid var(--border); color: var(--fg-2); }
.risks { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
.risk { border-left: 3px solid; border-radius: 8px; padding: 10px 14px; }
.risk-high { border-color: var(--high); background: var(--high-subtle); }
.risk-medium { border-color: var(--medium); background: var(--medium-subtle); }
.risk-low { border-color: var(--low); background: var(--low-subtle); }
.level { font-size: 11px; font-weight: 700; text-transform: uppercase; margin-right: 8px; }
.warning { background: var(--warning-subtle); border-radius: 8px; padding: 10px 14px; }
.warning strong { color: var(--warning); }
dl { display: grid; grid-template-columns: minmax(120px, auto) 1fr; gap: 6px 16px; margin: 0; }
dt { font-weight: 600; } dd { margin: 0; color: var(--fg-2); }
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
  const files = changedFiles(patch);
  const fileCount = new Set(files.map((file) => file.path)).size;
  const summaries = new Map(
    (content.layers ?? []).map((layer) => [layer.pr, layer.summary]),
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
          {fileCount} {fileCount === 1 ? 'file' : 'files'}
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
      {explainerRef.stack ? (
        <Section title="The stack">
          <ol className="flow">
            {explainerRef.stack.map((layer, index) => (
              <li key={layer.number}>
                <span className="number">{index + 1}</span>
                <div>
                  <strong>
                    <a href={layer.url}>#{layer.number}</a> {layer.title}
                  </strong>
                  <div className="muted">
                    <Text
                      text={summaries.get(layer.number) ?? ''}
                      glossary={glossary}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}
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
              {step.pr ? <span className="meta">#{step.pr}</span> : null}
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
                const file = findFilePatch(files, change.file, step.pr);
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
  return standalonePage(
    explainerRef.title,
    STYLES,
    <ExplainerDocument
      explainerRef={explainerRef}
      content={content}
      patch={patch}
    />,
  );
}

export function downloadExplainer(
  explainerRef: ExplainerRef,
  content: ExplainerContent,
  patch: string,
) {
  downloadHtml(
    explainerRef.title,
    'explanation',
    explainerHtml(explainerRef, content, patch),
  );
}
