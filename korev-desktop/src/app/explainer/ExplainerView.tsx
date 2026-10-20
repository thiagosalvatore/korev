import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Button,
  cn,
  DiffStat,
  Icon,
  IconButton,
  Spinner,
  type IconName,
} from '../../design-system';
import { parseUnifiedDiff } from '../../shared/diff';
import {
  changedFiles,
  uncoveredFiles,
  type Explainer,
  type ExplainerContent,
  type ExplainerRef,
  type FilePatch,
  type LayerSummary,
  type RiskLevel,
  type StackLayer,
  type TourStep,
} from '../../shared/explainer';
import type { ChatItem } from '../../shared/model';
import { api } from '../bridge';
import { reportFailure, toast } from '../ui/toast';
import { EMPTY_EXPLAINER_UI, updateExplainerUi, useUi } from '../ui-store';
import { downloadExplainer } from './exportHtml';
import { RichText } from './RichText';
import type { GlossaryEntry } from '../../shared/glossary';
import { Walkthrough } from './Walkthrough';

const RISK_STYLES: Record<RiskLevel, { label: string; className: string }> = {
  high: {
    label: 'High',
    className: 'border-risk-high bg-risk-high-subtle text-risk-high',
  },
  medium: {
    label: 'Medium',
    className: 'border-risk-medium bg-risk-medium-subtle text-risk-medium',
  },
  low: {
    label: 'Low',
    className: 'border-risk-low bg-risk-low-subtle text-fg-2',
  },
};

function useExplainer(sessionId: string, ref: ExplainerRef) {
  const [explainer, setExplainer] = useState<Explainer | null>(null);
  useEffect(() => {
    let current = true;
    void api.explainer(sessionId).then((loaded) => {
      if (current) setExplainer(loaded);
    });
    return () => {
      current = false;
    };
  }, [sessionId, ref.status, ref.revision]);
  return explainer;
}

function patchTotals(files: FilePatch[]) {
  let additions = 0;
  let deletions = 0;
  for (const file of files) {
    for (const row of parseUnifiedDiff(file.patch)) {
      if (row.type === 'add') additions += 1;
      if (row.type === 'del') deletions += 1;
    }
  }
  return { additions, deletions };
}

function latestActivity(items: ChatItem[] | null): string | null {
  const tool = items?.findLast((item) => item.kind === 'tool');
  return tool?.kind === 'tool' ? tool.summary || tool.name : null;
}

function Section({
  icon,
  title,
  aside,
  children,
}: {
  icon: IconName;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Icon name={icon} size={15} className="text-fg-3" />
        <h2 className="m-0 type-h3 text-fg-1">{title}</h2>
        {aside ? <span className="ml-auto">{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Banner({
  tone,
  icon,
  children,
  action,
}: {
  tone: 'warning' | 'danger' | 'neutral';
  icon: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      role="status"
      className={cn(
        'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm',
        tone === 'warning' && 'bg-warning-subtle text-warning-text',
        tone === 'danger' && 'bg-danger-subtle text-danger-text',
        tone === 'neutral' && 'bg-active text-fg-2',
      )}
    >
      {icon}
      <span className="flex-1">{children}</span>
      {action}
    </div>
  );
}

function updateExplainer(sessionId: string) {
  return api.updateExplainer(sessionId).then(reportFailure);
}

function StatusBanner({
  sessionId,
  explainer,
}: {
  sessionId: string;
  explainer: Explainer;
}) {
  const { ref, latestRevision } = explainer;
  if (ref.status === 'writing')
    return (
      <Banner
        tone="neutral"
        icon={<Icon name="loader-circle" size={14} className="animate-spin" />}
      >
        Updating the explanation…
      </Banner>
    );
  if (ref.status === 'failed')
    return (
      <Banner
        tone="danger"
        icon={<Icon name="circle-alert" size={14} />}
        action={
          <Button
            size="sm"
            variant="secondary"
            onClick={() => updateExplainer(sessionId)}
          >
            Try again
          </Button>
        }
      >
        The last update failed: {ref.error}
      </Banner>
    );
  if (latestRevision && latestRevision !== ref.revision)
    return (
      <Banner
        tone="warning"
        icon={<Icon name="git-commit-horizontal" size={14} />}
        action={
          <Button
            size="sm"
            variant="secondary"
            icon="refresh-cw"
            onClick={() => updateExplainer(sessionId)}
          >
            Update
          </Button>
        }
      >
        This change moved on since this explanation was written.
      </Banner>
    );
  return null;
}

function Header({
  explainer,
  content,
  files,
}: {
  explainer: Explainer;
  content: ExplainerContent;
  files: FilePatch[];
}) {
  const { ref } = explainer;
  const totals = useMemo(() => patchTotals(files), [files]);
  const number = ref.target.kind === 'pr' ? ref.target.number : null;
  const fileCount = new Set(files.map((file) => file.path)).size;
  return (
    <header className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs text-fg-3">
        <Icon
          name={number === null ? 'git-branch' : 'git-pull-request'}
          size={13}
        />
        {number === null ? <span>This branch</span> : <span>#{number}</span>}
        {ref.author ? <span>· @{ref.author}</span> : null}
        <span>
          · {fileCount} {fileCount === 1 ? 'file' : 'files'}
        </span>
        <DiffStat
          additions={totals.additions}
          deletions={totals.deletions}
          showBar={false}
        />
        <span className="flex-1" />
        {ref.url ? (
          <Button
            size="sm"
            variant="ghost"
            icon="square-arrow-out-up-right"
            onClick={() => void api.openExternal(ref.url ?? '')}
          >
            Open on GitHub
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          icon="download"
          onClick={() => downloadExplainer(ref, content, explainer.patch)}
        >
          Export HTML
        </Button>
      </div>
      <h1 className="m-0 type-h2 text-fg-1">{ref.title}</h1>
      {ref.stack ? <StackPath stack={ref.stack} /> : null}
    </header>
  );
}

function StackPath({ stack }: { stack: StackLayer[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-fg-3">
      <Icon name="layers" size={13} />
      <span>Stack of {stack.length}:</span>
      {stack.map((layer, index) => (
        <span key={layer.number} className="flex items-center gap-1.5">
          {index ? (
            <Icon name="arrow-right" size={11} className="text-fg-4" />
          ) : null}
          <button
            type="button"
            title={layer.title}
            className="cursor-pointer border-0 bg-transparent p-0 font-mono text-xs text-accent-text hover:underline"
            onClick={() => void api.openExternal(layer.url)}
          >
            #{layer.number}
          </button>
        </span>
      ))}
    </div>
  );
}

function StackLayers({
  stack,
  layers,
  tour,
  glossary,
  onOpenStep,
}: {
  stack: StackLayer[];
  layers: LayerSummary[];
  tour: TourStep[];
  glossary: GlossaryEntry[];
  onOpenStep: (index: number) => void;
}) {
  const summaries = new Map(layers.map((layer) => [layer.pr, layer.summary]));
  return (
    <Section icon="layers" title="The stack">
      <p className="m-0 text-sm text-fg-3">
        From the bottom of the stack up. Each pull request builds on the one
        before it.
      </p>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {stack.map((layer, position) => {
          const steps = tour.flatMap((step, index) =>
            step.pr === layer.number ? [index] : [],
          );
          const summary = summaries.get(layer.number);
          return (
            <li
              key={layer.number}
              aria-label={`#${layer.number} ${layer.title}`}
              className="flex gap-3 rounded-md border border-border-1 bg-surface px-4 py-3"
            >
              <span className="mt-0.5 flex size-[22px] flex-none items-center justify-center rounded-full bg-inset text-2xs font-semibold text-fg-2">
                {position + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-sm font-semibold text-fg-1">
                  <span className="font-mono text-accent-text">
                    #{layer.number}
                  </span>{' '}
                  {layer.title}
                </span>
                {summary ? (
                  <div className="flex flex-col gap-1 text-sm leading-relaxed text-fg-2">
                    <RichText text={summary} glossary={glossary} />
                  </div>
                ) : null}
              </div>
              {steps.length ? (
                <Button
                  size="sm"
                  variant="ghost"
                  iconRight="arrow-down"
                  onClick={() => onOpenStep(steps[0])}
                >
                  {steps.length} {steps.length === 1 ? 'step' : 'steps'}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

function Overview({
  content,
  glossary,
}: {
  content: ExplainerContent;
  glossary: GlossaryEntry[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-lg border border-border-1 bg-surface p-5">
        <span className="type-overline text-accent-text">In one sentence</span>
        <RichText
          text={content.headline}
          glossary={glossary}
          className="text-xl leading-snug font-semibold text-fg-1"
        />
        <div className="flex flex-col gap-2 text-md leading-relaxed text-fg-2">
          <RichText text={content.summary} glossary={glossary} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5 rounded-md border border-border-1 p-4">
          <span className="type-overline text-fg-3">Before</span>
          <div className="flex flex-col gap-2 text-sm leading-relaxed text-fg-2">
            <RichText text={content.before} glossary={glossary} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5 rounded-md border border-accent-border bg-accent-subtle p-4">
          <span className="type-overline text-accent-text">After</span>
          <div className="flex flex-col gap-2 text-sm leading-relaxed text-fg-1">
            <RichText text={content.after} glossary={glossary} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Flow({
  flow,
  glossary,
}: {
  flow: ExplainerContent['flow'];
  glossary: GlossaryEntry[];
}) {
  const [selected, setSelected] = useState(0);
  const stage = flow[selected];
  if (!stage) return null;
  return (
    <Section icon="workflow" title="How it works">
      <div className="flex flex-wrap items-center gap-1.5">
        {flow.map((entry, index) => (
          <div key={index} className="flex items-center gap-1.5">
            {index ? (
              <Icon name="arrow-right" size={14} className="text-fg-4" />
            ) : null}
            <button
              type="button"
              aria-pressed={index === selected}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-md border bg-surface px-3 py-2 text-sm text-fg-1 hover:bg-hover',
                index === selected ? 'border-accent' : 'border-border-2',
              )}
              onClick={() => setSelected(index)}
            >
              <span className="flex size-[18px] items-center justify-center rounded-full bg-inset text-2xs font-semibold text-fg-2">
                {index + 1}
              </span>
              {entry.label}
            </button>
          </div>
        ))}
      </div>
      <div className="text-sm leading-relaxed text-fg-2">
        <RichText text={stage.detail} glossary={glossary} />
      </div>
    </Section>
  );
}

function Risks({
  risks,
  glossary,
  onOpen,
}: {
  risks: ExplainerContent['risks'];
  glossary: GlossaryEntry[];
  onOpen: (file: string) => void;
}) {
  if (!risks.length) return null;
  return (
    <Section icon="eye" title="Look closely">
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {risks.map((risk, index) => {
          const style = RISK_STYLES[risk.level];
          return (
            <li
              key={index}
              className={cn(
                'flex flex-col gap-1.5 rounded-md border-l-[3px] px-3.5 py-2.5',
                style.className,
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-2xs font-semibold uppercase">
                  {style.label}
                </span>
                <span className="text-sm font-semibold text-fg-1">
                  {risk.title}
                </span>
              </div>
              <div className="flex flex-col gap-1 text-sm leading-relaxed text-fg-2">
                <RichText text={risk.explanation} glossary={glossary} />
              </div>
              {risk.file ? (
                <button
                  type="button"
                  className="w-fit cursor-pointer border-0 bg-transparent p-0 font-mono text-xs text-accent-text hover:underline"
                  onClick={() => onOpen(risk.file ?? '')}
                >
                  {risk.file}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function Questions({ questions }: { questions: string[] }) {
  if (!questions.length) return null;
  return (
    <Section icon="messages-square" title="Questions for the author">
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {questions.map((question, index) => (
          <li
            key={index}
            className="group flex items-start gap-2 rounded-sm px-2 py-1.5 text-sm text-fg-1 hover:bg-hover"
          >
            <Icon
              name="circle-help"
              size={14}
              className="mt-0.5 flex-none text-fg-3"
            />
            <span className="flex-1 leading-relaxed">{question}</span>
            <IconButton
              icon="copy"
              label="Copy question"
              size="sm"
              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              onClick={async () => {
                await navigator.clipboard.writeText(question);
                toast('Copied the question');
              }}
            />
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Files({
  content,
  patch,
}: {
  content: ExplainerContent;
  patch: string;
}) {
  const missing = uncoveredFiles(content, patch);
  if (!content.routine.length && !missing.length) return null;
  return (
    <Section icon="files" title="Other files">
      {missing.length ? (
        <div className="flex flex-col gap-1.5 rounded-md bg-warning-subtle px-3.5 py-2.5">
          <span className="flex items-center gap-2 text-sm font-semibold text-warning-text">
            <Icon name="triangle-alert" size={14} />
            Not explained
          </span>
          <p className="m-0 text-sm text-fg-2">
            The explanation does not mention these changed files. Read them in
            the diff.
          </p>
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {missing.map((file) => (
              <li key={file} className="font-mono text-xs text-fg-1">
                {file}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {content.routine.length ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {content.routine.map((entry) => (
            <li
              key={entry.file}
              className="flex items-baseline gap-3 px-2 text-sm"
            >
              <span className="font-mono text-xs text-fg-1">{entry.file}</span>
              <span className="text-fg-3">{entry.reason}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}

function Glossary({ glossary }: { glossary: GlossaryEntry[] }) {
  if (!glossary.length) return null;
  return (
    <Section icon="book-open" title="Words used here">
      <dl className="m-0 grid grid-cols-[minmax(120px,auto)_1fr] gap-x-4 gap-y-2">
        {glossary.map((entry) => (
          <div key={entry.term} className="contents">
            <dt className="text-sm font-semibold text-fg-1">{entry.term}</dt>
            <dd className="m-0 text-sm text-fg-2">{entry.meaning}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

function stepOfFile(tour: TourStep[], file: string): number {
  return tour.findIndex((step) =>
    step.changes.some((change) => change.file === file),
  );
}

function Explanation({
  sessionId,
  explainer,
  content,
  onAsk,
  onOpenInDiff,
}: {
  sessionId: string;
  explainer: Explainer;
  content: ExplainerContent;
  onAsk: (text: string) => void;
  onOpenInDiff: ((file: string) => void) | null;
}) {
  const ui =
    useUi((state) => state.explainers[sessionId]) ?? EMPTY_EXPLAINER_UI;
  const walkthrough = useRef<HTMLDivElement>(null);
  const files = useMemo(() => changedFiles(explainer.patch), [explainer.patch]);
  const step = Math.min(ui.step, content.tour.length - 1);

  function setActive(index: number) {
    updateExplainerUi(sessionId, () => ({ step: index }));
  }

  function understood(index: number) {
    updateExplainerUi(sessionId, (current) => ({
      understood: current.understood.includes(index)
        ? current.understood
        : [...current.understood, index],
    }));
    if (index < content.tour.length - 1) setActive(index + 1);
  }

  function openStep(index: number) {
    if (index >= 0) setActive(index);
    walkthrough.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="flex flex-col gap-8">
      <Header explainer={explainer} content={content} files={files} />
      <Overview content={content} glossary={content.glossary} />
      {explainer.ref.stack ? (
        <StackLayers
          stack={explainer.ref.stack}
          layers={content.layers ?? []}
          tour={content.tour}
          glossary={content.glossary}
          onOpenStep={openStep}
        />
      ) : null}
      <Flow flow={content.flow} glossary={content.glossary} />
      <div ref={walkthrough} className="scroll-mt-4">
        <Section icon="footprints" title="Walkthrough">
          <Walkthrough
            tour={content.tour}
            files={files}
            glossary={content.glossary}
            active={step}
            understood={ui.understood.filter(
              (index) => index < content.tour.length,
            )}
            onSelect={setActive}
            onUnderstood={understood}
            onAsk={(entry, index) =>
              onAsk(`About step ${index + 1}, "${entry.title}": `)
            }
            onOpenInDiff={onOpenInDiff}
          />
        </Section>
      </div>
      <Risks
        risks={content.risks}
        glossary={content.glossary}
        onOpen={(file) => openStep(stepOfFile(content.tour, file))}
      />
      <Questions questions={content.questions} />
      <Files content={content} patch={explainer.patch} />
      <Glossary glossary={content.glossary} />
    </div>
  );
}

function Writing({
  title,
  activity,
  onShowChat,
}: {
  title: string;
  activity: string | null;
  onShowChat: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 pt-[12vh] text-center">
      <Spinner />
      <p className="m-0 type-h3 text-fg-1">Writing an explanation of {title}</p>
      <p className="m-0 max-w-md truncate text-sm text-fg-3">
        {activity ?? 'Reading the change…'}
      </p>
      <Button
        size="sm"
        variant="ghost"
        icon="message-square"
        onClick={onShowChat}
      >
        Watch the agent
      </Button>
    </div>
  );
}

function Failed({
  sessionId,
  error,
  onShowChat,
}: {
  sessionId: string;
  error: string;
  onShowChat: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 pt-[12vh] text-center">
      <Icon name="circle-alert" size={22} className="text-danger-text" />
      <p className="m-0 type-h3 text-fg-1">
        Korev could not build the explanation
      </p>
      <p className="m-0 max-w-md text-sm text-fg-3">{error}</p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="primary"
          icon="refresh-cw"
          onClick={() => updateExplainer(sessionId)}
        >
          Try again
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon="message-square"
          onClick={onShowChat}
        >
          Open chat
        </Button>
      </div>
    </div>
  );
}

export function ExplainerView({
  sessionId,
  explainerRef,
  items,
  onAsk,
  onShowChat,
  onOpenInDiff,
}: {
  sessionId: string;
  explainerRef: ExplainerRef;
  items: ChatItem[] | null;
  onAsk: (text: string) => void;
  onShowChat: () => void;
  onOpenInDiff: ((file: string) => void) | null;
}) {
  const explainer = useExplainer(sessionId, explainerRef);
  const content = explainer?.content ?? null;
  let body: ReactNode;
  if (!explainer) body = <Spinner />;
  else if (content)
    body = (
      <Explanation
        sessionId={sessionId}
        explainer={explainer}
        content={content}
        onAsk={onAsk}
        onOpenInDiff={onOpenInDiff}
      />
    );
  else if (explainerRef.status === 'failed')
    body = (
      <Failed
        sessionId={sessionId}
        error={explainerRef.error ?? ''}
        onShowChat={onShowChat}
      />
    );
  else
    body = (
      <Writing
        title={explainerRef.title}
        activity={latestActivity(items)}
        onShowChat={onShowChat}
      />
    );
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-4 px-6 py-6">
        {explainer && content ? (
          <StatusBanner sessionId={sessionId} explainer={explainer} />
        ) : null}
        {body}
      </div>
    </div>
  );
}
