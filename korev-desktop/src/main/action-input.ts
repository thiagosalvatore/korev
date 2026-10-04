import type {
  MergeMethod,
  MergeRequest,
  MergeTool,
  PrTarget,
} from '../shared/merge';
import { isRepoName } from './repo-names';

const MERGE_METHODS: readonly MergeMethod[] = ['merge', 'squash', 'rebase'];
const MERGE_TOOLS: readonly MergeTool[] = [
  'github',
  'trunk',
  'mergify',
  'aviator',
];

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function isPrNumber(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

export function parseTarget(value: unknown): PrTarget | null {
  const { id, repo, number } = asRecord(value);
  if (typeof id !== 'string' || !id) return null;
  if (typeof repo !== 'string' || !isRepoName(repo)) return null;
  if (!isPrNumber(number)) return null;
  return { id, repo, number };
}

export function parseTargets(value: unknown): PrTarget[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const targets = value.map(parseTarget);
  return targets.every((target) => target !== null) ? targets : null;
}

export function parseMergeRequest(value: unknown): MergeRequest | null {
  const fields = asRecord(value);
  const target = parseTarget(fields.target);
  const numbers = Array.isArray(fields.numbers)
    ? fields.numbers.filter(isPrNumber)
    : [];
  if (!target || !numbers.includes(target.number)) return null;
  const method = MERGE_METHODS.find((option) => option === fields.method);
  return { target, numbers, method: method ?? null };
}

export function parseMergeTool(value: unknown): MergeTool | null {
  return MERGE_TOOLS.find((tool) => tool === value) ?? null;
}
