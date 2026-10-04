import type { PullRequest, StackLayer } from '../../shared/pull-request';
import { prRef } from '../../shared/pr-ref';
import type { Placement } from './structure';

export interface ItemShape {
  pr: PullRequest;
}

export type LayerShape<Item extends ItemShape> =
  | { kind: 'other'; position: number; layer: StackLayer }
  | { kind: 'mine' | 'requested'; position: number; item: Item };

export interface StackShape<Layer> {
  id: string;
  repo: string;
  layers: Layer[];
}

export type EntryShape<Item, Stack> =
  | { kind: 'pr'; item: Item }
  | { kind: 'stack'; stack: Stack };

const STACK_GROUP_SEPARATOR = '>';
const TOGGLE_KEY_PREFIX = 'toggle:';
const SECTION_TOGGLE_PREFIX = 'section:';
const APPROVED_TOGGLE = 'approved-section';
const APPROVED_KEY_PREFIX = 'approved:';

export function layerRef(repo: string, layer: StackLayer): string {
  return prRef({ repo, number: layer.number });
}

export function layerKey<Item extends ItemShape>(
  layer: LayerShape<Item>,
  repo: string,
): string {
  if (layer.kind === 'other') return layerRef(repo, layer.layer);
  return prRef(layer.item.pr);
}

export function toggleKey(stackId: string): string {
  return `${TOGGLE_KEY_PREFIX}${stackId}`;
}

export function isToggleKey(key: string): boolean {
  return key.startsWith(TOGGLE_KEY_PREFIX);
}

export function sectionToggleKey(section: string): string {
  return toggleKey(`${SECTION_TOGGLE_PREFIX}${section}`);
}

export function approvedToggleKey(): string {
  return toggleKey(APPROVED_TOGGLE);
}

export function approvedKey(pr: { repo: string; number: number }): string {
  return `${APPROVED_KEY_PREFIX}${prRef(pr)}`;
}

function stackPlacements<Item extends ItemShape>(
  stack: StackShape<LayerShape<Item>>,
  group: string,
): Placement[] {
  const stackGroup = `${group}${STACK_GROUP_SEPARATOR}${stack.id}`;
  return [...stack.layers]
    .sort((left, right) => left.position - right.position)
    .map((layer) => ({ key: layerKey(layer, stack.repo), group: stackGroup }));
}

export function entryPlacements<
  Item extends ItemShape,
  Stack extends StackShape<LayerShape<Item>>,
>(entries: EntryShape<Item, Stack>[], group: string): Placement[] {
  return entries.flatMap((entry) =>
    entry.kind === 'pr'
      ? [{ key: prRef(entry.item.pr), group }]
      : stackPlacements(entry.stack, group),
  );
}

export interface EntryIndex<Item, Layer, Stack> {
  items: Map<string, Item>;
  layers: Map<string, Layer>;
  stacks: Map<string, Stack>;
}

function indexStack<Item extends ItemShape, Layer extends LayerShape<Item>>(
  stack: StackShape<Layer>,
  index: EntryIndex<Item, Layer, StackShape<Layer>>,
) {
  stack.layers.forEach((layer) => {
    index.layers.set(layerKey(layer, stack.repo), layer);
    if (layer.kind !== 'other')
      index.items.set(prRef(layer.item.pr), layer.item);
  });
}

export function indexEntries<
  Item extends ItemShape,
  Layer extends LayerShape<Item>,
  Stack extends StackShape<Layer>,
>(entries: EntryShape<Item, Stack>[]): EntryIndex<Item, Layer, Stack> {
  const index: EntryIndex<Item, Layer, Stack> = {
    items: new Map(),
    layers: new Map(),
    stacks: new Map(),
  };
  entries.forEach((entry) => {
    if (entry.kind === 'pr') {
      index.items.set(prRef(entry.item.pr), entry.item);
      return;
    }
    index.stacks.set(entry.stack.id, entry.stack);
    indexStack(entry.stack, index);
  });
  return index;
}

function refreshStack<
  Item extends ItemShape,
  Layer extends LayerShape<Item>,
  Stack extends StackShape<Layer>,
>(held: Stack, index: EntryIndex<Item, Layer, Stack>): Stack {
  const latest = index.stacks.get(held.id) ?? held;
  return {
    ...latest,
    layers: held.layers.map(
      (layer) => index.layers.get(layerKey(layer, held.repo)) ?? layer,
    ),
  };
}

export function refreshEntries<
  Item extends ItemShape,
  Layer extends LayerShape<Item>,
  Stack extends StackShape<Layer>,
>(
  held: EntryShape<Item, Stack>[],
  index: EntryIndex<Item, Layer, Stack>,
): EntryShape<Item, Stack>[] {
  return held.map((entry) => {
    if (entry.kind === 'stack') {
      return { kind: 'stack', stack: refreshStack(entry.stack, index) };
    }
    const latest = index.items.get(prRef(entry.item.pr)) ?? entry.item;
    return { kind: 'pr', item: latest };
  });
}
