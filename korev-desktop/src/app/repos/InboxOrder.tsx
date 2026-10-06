import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Icon, Select, type SelectOption } from '../../design-system';
import type { MergeTool, RepoMergeInfo } from '../../shared/merge';
import { saveMergeWith, saveRepos } from '../useSettings';

const MOVE_STEPS: Partial<Record<string, number>> = {
  ArrowUp: -1,
  ArrowDown: 1,
};

export function moveRepo(repos: string[], repo: string, to: number): string[] {
  const others = repos.filter((other) => other !== repo);
  const target = Math.max(0, Math.min(to, others.length));
  return [...others.slice(0, target), repo, ...others.slice(target)];
}

const DETECTED_QUEUE = 'detected-queue';
const ORDER_HEADING = 'Inbox order';
const MERGE_WITH_HEADING = 'Merge with';
const MERGE_WITH_HELP =
  "Merge with is the tool that merges each repo's PRs. Korev shows its queue and sends PRs to it.";

const MERGE_TOOL_OPTIONS: SelectOption[] = [
  { value: 'github', label: 'GitHub' },
  { value: 'trunk', label: 'Trunk' },
  { value: 'mergify', label: 'Mergify' },
  { value: 'aviator', label: 'Aviator' },
];

const DETECTED_QUEUE_OPTIONS: SelectOption[] = [
  { value: DETECTED_QUEUE, label: 'GitHub merge queue · detected' },
];

function MergeWithSelect({
  repo,
  tool,
  info,
}: {
  repo: string;
  tool: MergeTool;
  info: RepoMergeInfo | undefined;
}) {
  const detected = info?.hasMergeQueue ?? false;
  return (
    <Select
      ariaLabel={`Merge ${repo} with`}
      options={detected ? DETECTED_QUEUE_OPTIONS : MERGE_TOOL_OPTIONS}
      value={detected ? DETECTED_QUEUE : tool}
      disabled={detected}
      onChange={(value) => void saveMergeWith(repo, value as MergeTool)}
      className="w-56"
    />
  );
}

function placeLabel(index: number, total: number): string {
  return `${index + 1} of ${total}`;
}

interface OrderRowProps {
  repo: string;
  tool: MergeTool;
  info: RepoMergeInfo | undefined;
  index: number;
  total: number;
  handleRef: (element: HTMLButtonElement | null) => void;
  onMove: (to: number) => void;
  onDragStart: () => void;
  onDrop: () => void;
}

function OrderRow({
  repo,
  tool,
  info,
  index,
  total,
  handleRef,
  onMove,
  onDragStart,
  onDrop,
}: OrderRowProps) {
  function moveWithKeys(event: KeyboardEvent<HTMLButtonElement>) {
    const step = MOVE_STEPS[event.key];
    if (!event.altKey || step === undefined) return;
    event.preventDefault();
    onMove(index + step);
  }

  return (
    <li
      draggable
      onDragStart={onDragStart}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      className="flex h-10 items-center gap-2 rounded-sm px-1 hover:bg-hover"
    >
      <button
        ref={handleRef}
        type="button"
        aria-label={`Reorder ${repo}, ${placeLabel(index, total)}`}
        title="Drag, or press ⌥↑ / ⌥↓"
        onKeyDown={moveWithKeys}
        className="flex size-6 cursor-grab items-center justify-center rounded-xs border-0 bg-transparent text-fg-3 hover:text-fg-1 focus-visible:shadow-focus"
      >
        <Icon name="grip-vertical" size={14} />
      </button>
      <span className="min-w-0 flex-1 truncate font-mono text-sm text-fg-1">
        {repo}
      </span>
      <MergeWithSelect repo={repo} tool={tool} info={info} />
    </li>
  );
}

export interface InboxOrderProps {
  repos: string[];
  mergeWith: Record<string, MergeTool>;
  repoMerge: Record<string, RepoMergeInfo>;
}

export function InboxOrder({ repos, mergeWith, repoMerge }: InboxOrderProps) {
  const [announcement, setAnnouncement] = useState('');
  const [dragged, setDragged] = useState<string | null>(null);
  const [moved, setMoved] = useState<string | null>(null);
  const handles = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    if (moved) handles.current.get(moved)?.focus();
  }, [moved, repos]);

  function move(repo: string, to: number) {
    const next = moveRepo(repos, repo, to);
    if (next.every((name, index) => name === repos[index])) return;
    setMoved(repo);
    setAnnouncement(
      `Moved ${repo} to ${placeLabel(next.indexOf(repo), next.length)}`,
    );
    void saveRepos(next);
  }

  function dropOn(index: number) {
    if (dragged) move(dragged, index);
    setDragged(null);
  }

  return (
    <div className="mt-5">
      <div className="flex items-baseline gap-2 px-1">
        <h3 className="m-0 flex-1 type-overline text-fg-3">{ORDER_HEADING}</h3>
        <span className="w-56 type-overline text-fg-3">
          {MERGE_WITH_HEADING}
        </span>
      </div>
      <p className="mt-1 mb-1.5 px-1 text-xs text-fg-3">{MERGE_WITH_HELP}</p>
      <ol className="m-0 flex list-none flex-col p-0">
        {repos.map((repo, index) => (
          <OrderRow
            key={repo}
            repo={repo}
            tool={mergeWith[repo] ?? 'github'}
            info={repoMerge[repo]}
            index={index}
            total={repos.length}
            handleRef={(element) => {
              if (element) handles.current.set(repo, element);
              else handles.current.delete(repo);
            }}
            onMove={(to) => move(repo, to)}
            onDragStart={() => setDragged(repo)}
            onDrop={() => dropOn(index)}
          />
        ))}
      </ol>
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
