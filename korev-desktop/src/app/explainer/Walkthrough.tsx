import { useEffect, useState } from 'react';
import { Button, cn, Icon } from '../../design-system';
import {
  hunksForChange,
  type CodeChange,
  type FilePatch,
  type TourStep,
} from '../../shared/explainer';
import { UnifiedRows } from '../diff/DiffRows';
import { languageOf } from '../diff/language';
import { RichText } from './RichText';
import type { GlossaryEntry } from '../../shared/glossary';

const COLLAPSED_ROW_LIMIT = 120;
const TYPING_TARGETS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function lineLabel(change: CodeChange): string {
  if (change.startLine === undefined) return 'whole file';
  const end = change.endLine ?? change.startLine;
  return end > change.startLine
    ? `lines ${change.startLine}–${end}`
    : `line ${change.startLine}`;
}

function CodeExcerpt({
  change,
  file,
  onOpenInDiff,
}: {
  change: CodeChange;
  file: FilePatch | undefined;
  onOpenInDiff: ((file: string) => void) | null;
}) {
  const [open, setOpen] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const rows = file ? hunksForChange(file, change) : [];
  const shown = showAll ? rows : rows.slice(0, COLLAPSED_ROW_LIMIT);
  return (
    <div className="overflow-hidden rounded-md border border-border-1 bg-surface">
      <div className="flex h-8 items-center gap-2 border-b border-border-1 px-2.5">
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? 'Hide code' : 'Show code'}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left"
          onClick={() => setOpen((value) => !value)}
        >
          <Icon
            name="chevron-down"
            size={13}
            className={cn(
              'text-fg-3 transition-transform',
              !open && '-rotate-90',
            )}
          />
          <span className="truncate font-mono text-xs text-fg-1">
            {change.file}
          </span>
          <span className="flex-none text-2xs text-fg-4">
            {lineLabel(change)}
          </span>
        </button>
        {onOpenInDiff ? (
          <Button
            size="sm"
            variant="ghost"
            icon="git-compare"
            onClick={() => onOpenInDiff(change.file)}
          >
            Open in diff
          </Button>
        ) : null}
      </div>
      {open ? (
        <div className="max-h-[420px] overflow-auto">
          {!file ? (
            <p className="m-0 px-3 py-2.5 text-xs text-fg-3">
              This file is not in the diff.
            </p>
          ) : !rows.length ? (
            <p className="m-0 px-3 py-2.5 text-xs text-fg-3">
              No line changes to show here.
            </p>
          ) : (
            <div className="kv-diff">
              <UnifiedRows rows={shown} lang={languageOf(change.file)} />
            </div>
          )}
          {rows.length > shown.length ? (
            <button
              type="button"
              className="w-full cursor-pointer border-0 border-t border-border-1 bg-transparent py-1.5 text-xs text-accent-text hover:bg-hover"
              onClick={() => setShowAll(true)}
            >
              Show all {rows.length} lines
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function StepList({
  tour,
  active,
  understood,
  onSelect,
}: {
  tour: TourStep[];
  active: number;
  understood: number[];
  onSelect: (index: number) => void;
}) {
  return (
    <ol className="m-0 flex list-none flex-col gap-0.5 p-0">
      {tour.map((step, index) => {
        const done = understood.includes(index);
        return (
          <li key={index}>
            <button
              type="button"
              aria-current={index === active ? 'step' : undefined}
              className={cn(
                'flex w-full cursor-pointer items-start gap-2 rounded-sm border-0 bg-transparent px-2 py-1.5 text-left text-sm text-fg-2 hover:bg-hover hover:text-fg-1',
                index === active && 'bg-active text-fg-1',
              )}
              onClick={() => onSelect(index)}
            >
              <span
                className={cn(
                  'mt-px flex size-[18px] flex-none items-center justify-center rounded-full text-2xs font-semibold',
                  done
                    ? 'bg-success-subtle text-success-text'
                    : index === active
                      ? 'bg-accent text-fg-on-accent'
                      : 'bg-inset text-fg-3',
                )}
              >
                {done ? <Icon name="check" size={11} /> : index + 1}
              </span>
              <span className="leading-snug">{step.title}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return TYPING_TARGETS.has(target.tagName) || target.isContentEditable;
}

function useArrowKeys(onStep: (step: number) => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(event.target)) return;
      if (event.key === 'ArrowRight') onStep(1);
      if (event.key === 'ArrowLeft') onStep(-1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onStep]);
}

export function Walkthrough({
  tour,
  files,
  glossary,
  active,
  understood,
  onSelect,
  onUnderstood,
  onAsk,
  onOpenInDiff,
}: {
  tour: TourStep[];
  files: Map<string, FilePatch>;
  glossary: GlossaryEntry[];
  active: number;
  understood: number[];
  onSelect: (index: number) => void;
  onUnderstood: (index: number) => void;
  onAsk: (step: TourStep, index: number) => void;
  onOpenInDiff: ((file: string) => void) | null;
}) {
  const step = tour[active];
  const last = active === tour.length - 1;
  const done = understood.includes(active);
  useArrowKeys((delta) =>
    onSelect(Math.min(Math.max(active + delta, 0), tour.length - 1)),
  );
  return (
    <div className="grid grid-cols-[minmax(160px,220px)_1fr] gap-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5 px-2">
          <span className="text-xs text-fg-3">
            {understood.length} of {tour.length} understood
          </span>
          <div className="h-1 overflow-hidden rounded-full bg-inset">
            <div
              className="h-full rounded-full bg-success transition-[width] duration-(--dur-base)"
              style={{ width: `${(understood.length / tour.length) * 100}%` }}
            />
          </div>
        </div>
        <StepList
          tour={tour}
          active={active}
          understood={understood}
          onSelect={onSelect}
        />
      </div>
      <article
        aria-label={`Step ${active + 1}: ${step.title}`}
        className="flex min-w-0 flex-col gap-3"
      >
        <span className="type-overline text-fg-3">
          Step {active + 1} of {tour.length}
        </span>
        <h3 className="m-0 type-h2 text-fg-1">{step.title}</h3>
        <div className="flex flex-col gap-2 text-md leading-relaxed text-fg-1">
          <RichText text={step.explanation} glossary={glossary} />
        </div>
        {step.why.trim() ? (
          <div className="flex gap-2 rounded-md bg-accent-subtle px-3 py-2.5 text-sm text-fg-1">
            <Icon
              name="lightbulb"
              size={14}
              className="mt-0.5 flex-none text-accent-text"
            />
            <div className="flex flex-col gap-1">
              <span className="font-semibold text-accent-text">Why</span>
              <RichText text={step.why} glossary={glossary} />
            </div>
          </div>
        ) : null}
        {step.changes.map((change, index) => (
          <CodeExcerpt
            key={`${active}:${index}`}
            change={change}
            file={files.get(change.file)}
            onOpenInDiff={onOpenInDiff}
          />
        ))}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            size="sm"
            variant="ghost"
            icon="message-circle-question"
            onClick={() => onAsk(step, active)}
          >
            Ask about this step
          </Button>
          <span className="flex-1" />
          <Button
            size="sm"
            variant="ghost"
            icon="arrow-left"
            disabled={active === 0}
            onClick={() => onSelect(active - 1)}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant={done && !last ? 'secondary' : 'primary'}
            icon={last ? 'check' : undefined}
            iconRight={last ? undefined : 'arrow-right'}
            onClick={() => onUnderstood(active)}
          >
            {last ? 'Got it' : 'Got it, next step'}
          </Button>
        </div>
      </article>
    </div>
  );
}
