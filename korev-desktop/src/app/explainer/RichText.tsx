import { cn } from '../../design-system';
import {
  richSegments,
  type GlossaryEntry,
  type RichSegment,
} from '../../shared/glossary';

const PARAGRAPH_BREAK = /\n{2,}/;

function GlossaryTerm({ text, meaning }: { text: string; meaning: string }) {
  return (
    <span
      tabIndex={0}
      className="group relative cursor-help underline decoration-fg-4 decoration-dotted underline-offset-4 outline-none focus-visible:decoration-accent"
    >
      {text}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-0 z-30 mb-1.5 hidden w-64 rounded-md border border-border-2 bg-raised p-2.5 text-xs leading-snug font-normal text-fg-2 shadow-pop group-hover:block group-focus:block"
      >
        <span className="mb-0.5 block font-semibold text-fg-1">{text}</span>
        {meaning}
      </span>
    </span>
  );
}

function Segment({ segment }: { segment: RichSegment }) {
  if (segment.kind === 'code')
    return (
      <code className="rounded-xs bg-inset px-1 font-mono text-[0.9em] text-fg-1">
        {segment.text}
      </code>
    );
  if (segment.kind === 'term')
    return <GlossaryTerm text={segment.text} meaning={segment.meaning} />;
  return segment.text;
}

export function RichText({
  text,
  glossary,
  className,
}: {
  text: string;
  glossary: GlossaryEntry[];
  className?: string;
}) {
  return text
    .split(PARAGRAPH_BREAK)
    .filter((paragraph) => paragraph.trim())
    .map((paragraph, index) => (
      <p key={index} className={cn('m-0 whitespace-pre-line', className)}>
        {richSegments(paragraph, glossary).map((segment, part) => (
          <Segment key={part} segment={segment} />
        ))}
      </p>
    ));
}
