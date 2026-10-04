import {
  mergeMethodChoice,
  mergePathFor,
  mergeRange,
  type MergeMethodChoice,
} from '../../inbox/merge-path';
import { QUEUE_COMMANDS } from '../../inbox/queue-status';
import type { InboxSnapshot, MyPr } from '../../shared/inbox';
import type {
  CommentMergeTool,
  MergePath,
  MergeTool,
  PrTarget,
} from '../../shared/merge';
import { prRef } from '../../shared/pr-ref';
import type { StackLayer } from '../../shared/pull-request';
import type { SubjectIndex } from './list-model';

export interface MergePlan {
  path: MergePath;
  numbers: number[];
  othersLayers: StackLayer[];
  blocker: string | null;
  partial: boolean;
  method: MergeMethodChoice;
}

const TOOL_NAMES: Record<CommentMergeTool, string> = {
  trunk: 'Trunk',
  mergify: 'Mergify',
  aviator: 'Aviator',
};

export function toolName(tool: CommentMergeTool): string {
  return TOOL_NAMES[tool];
}

export function mergeButtonLabel(path: MergePath): string {
  if (path.kind === 'github-queue') return 'Add to merge queue';
  if (path.kind === 'comment') return `Send to ${toolName(path.tool)}`;
  return 'Merge';
}

export function mergeTitle(path: MergePath, number: number): string {
  if (path.kind === 'github-queue') return `Add #${number} to the merge queue?`;
  if (path.kind === 'comment')
    return `Send #${number} to ${toolName(path.tool)}?`;
  return `Merge #${number}?`;
}

export function queueCommand(
  path: MergePath,
  action: 'merge' | 'cancel',
): string | null {
  return path.kind === 'comment' ? QUEUE_COMMANDS[path.tool][action] : null;
}

export function numberList(numbers: number[]): string {
  const refs = numbers.map((number) => `#${number}`);
  if (refs.length <= 1) return refs.join('');
  return `${refs.slice(0, -1).join(', ')} and ${refs.at(-1)}`;
}

export function numberSpan(numbers: number[]): string {
  if (numbers.length <= 1) return `#${numbers[0]}`;
  return `#${numbers[0]}–#${numbers.at(-1)}`;
}

function layerBlocker(
  layer: StackLayer,
  repo: string,
  subjects: SubjectIndex,
): string | null {
  const subject = subjects.get(prRef({ repo, number: layer.number }));
  if (subject?.kind === 'mine') return itemBlocker(subject.item);
  return layer.isDraft ? `#${layer.number} isn't ready: draft` : null;
}

function itemBlocker(item: MyPr): string | null {
  if (item.bucket === 'ready') return null;
  const reason = item.reasons[0]?.label.toLowerCase() ?? 'not ready';
  return `#${item.pr.number} isn't ready: ${reason}`;
}

function layersInRange(item: MyPr, numbers: number[]): StackLayer[] {
  return (item.pr.stack?.layers ?? []).filter((layer) =>
    numbers.includes(layer.number),
  );
}

export function mergePlan(
  item: MyPr,
  snapshot: InboxSnapshot,
  mergeWith: MergeTool,
  subjects: SubjectIndex,
): MergePlan {
  const { pr } = item;
  const info = snapshot.repoMerge[pr.repo];
  const numbers = mergeRange(pr);
  const lower = layersInRange(item, numbers).filter(
    (layer) => layer.number !== pr.number,
  );
  const blockers = [
    ...lower.map((layer) => layerBlocker(layer, pr.repo, subjects)),
    itemBlocker(item),
  ];
  return {
    path: mergePathFor(info, mergeWith),
    numbers,
    othersLayers: lower.filter(
      (layer) => layer.authorLogin !== snapshot.viewerLogin,
    ),
    blocker: blockers.find((blocker) => blocker !== null) ?? null,
    partial: pr.stack ? pr.stack.size > pr.stack.layers.length : false,
    method: mergeMethodChoice(info),
  };
}

export interface ClosePlan {
  targets: PrTarget[];
  leftOpen: StackLayer[];
}

export function targetOf(item: MyPr): PrTarget {
  return { id: item.pr.id, repo: item.pr.repo, number: item.pr.number };
}

export function isQuiet(item: MyPr): boolean {
  return item.bucket === 'stale' || item.bucket === 'kept';
}

function openLayers(item: MyPr): StackLayer[] {
  return (item.pr.stack?.layers ?? []).filter(
    (layer) => layer.state === 'OPEN',
  );
}

function viewerItem(
  item: MyPr,
  layer: StackLayer,
  subjects: SubjectIndex,
): MyPr[] {
  const subject = subjects.get(
    prRef({ repo: item.pr.repo, number: layer.number }),
  );
  return subject?.kind === 'mine' ? [subject.item] : [];
}

export function quietStackItems(item: MyPr, subjects: SubjectIndex): MyPr[] {
  if (!item.pr.stack || !isQuiet(item)) return [item];
  const mine = openLayers(item).flatMap((layer) =>
    viewerItem(item, layer, subjects),
  );
  return mine.every(isQuiet) ? mine : [item];
}

export function closePlan(item: MyPr, subjects: SubjectIndex): ClosePlan {
  const closing = quietStackItems(item, subjects);
  if (closing.length === 1) return { targets: [targetOf(item)], leftOpen: [] };
  const numbers = new Set(closing.map((closed) => closed.pr.number));
  const lowest = Math.min(
    ...closing.map((closed) => closed.pr.stack?.position ?? 0),
  );
  return {
    targets: closing.map(targetOf),
    leftOpen: openLayers(item).filter(
      (layer) => !numbers.has(layer.number) && layer.position > lowest,
    ),
  };
}

export function layersBuiltOn(item: MyPr): number[] {
  const stack = item.pr.stack;
  if (!stack) return [];
  return stack.layers
    .filter((layer) => layer.position > stack.position)
    .filter((layer) => layer.state === 'OPEN')
    .map((layer) => layer.number);
}
