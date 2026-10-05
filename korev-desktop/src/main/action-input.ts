import {
  REVIEW_SEVERITIES,
  type QuestionAnswers,
  type ReviewComment,
  type ReviewDraft,
  type ReviewEvent,
  type ReviewSubmission,
} from '../shared/agent-tasks';
import type {
  MergeMethod,
  MergeRequest,
  MergeTool,
  PrTarget,
} from '../shared/merge';
import type { TerminalSize } from '../shared/terminal';
import { isRepoName } from './repo-names';

const MAX_TERMINAL_CELLS = 1000;
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

function isTerminalCells(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) > 0 &&
    (value as number) <= MAX_TERMINAL_CELLS
  );
}

export function parseTerminalSize(value: unknown): TerminalSize | null {
  const { cols, rows } = asRecord(value);
  if (!isTerminalCells(cols) || !isTerminalCells(rows)) return null;
  return { cols, rows };
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

export function parseAnswers(value: unknown): QuestionAnswers | null {
  if (typeof value !== 'object' || value === null) return null;
  const entries = Object.entries(value);
  if (!entries.every(([, answer]) => typeof answer === 'string')) return null;
  return Object.fromEntries(entries) as QuestionAnswers;
}

const REVIEW_EVENTS: readonly ReviewEvent[] = ['COMMENT', 'REQUEST_CHANGES'];
const COMMENT_STATUSES: readonly ReviewComment['status'][] = [
  'open',
  'accepted',
  'dismissed',
];

function isText(value: unknown): value is string {
  return typeof value === 'string';
}

function isLine(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

function parseEvent(value: unknown): ReviewEvent | null {
  return REVIEW_EVENTS.find((event) => event === value) ?? null;
}

function parseSubmittedComment(
  value: unknown,
): ReviewSubmission['comments'][number] | null {
  const { path, line, body } = asRecord(value);
  if (!isText(path) || !path || !isLine(line) || !isText(body)) return null;
  return { path, line, body };
}

export function parseReviewSubmission(value: unknown): ReviewSubmission | null {
  const fields = asRecord(value);
  const event = parseEvent(fields.event);
  if (!event || !isText(fields.summary) || !Array.isArray(fields.comments)) {
    return null;
  }
  const comments = fields.comments.map(parseSubmittedComment);
  if (!comments.every((comment) => comment !== null)) return null;
  return { summary: fields.summary, event, comments };
}

function parseDraftComment(value: unknown): ReviewComment | null {
  const fields = asRecord(value);
  const submitted = parseSubmittedComment(value);
  const severity = REVIEW_SEVERITIES.find((level) => level === fields.severity);
  const status = COMMENT_STATUSES.find((option) => option === fields.status);
  const context = Array.isArray(fields.context) ? fields.context : null;
  if (!submitted || !severity || !status || !isText(fields.id)) return null;
  if (!isLine(fields.contextStart) || !context?.every(isText)) return null;
  return {
    ...submitted,
    id: fields.id,
    severity,
    status,
    contextStart: fields.contextStart,
    context,
  };
}

export function parseReviewDraft(value: unknown): ReviewDraft | null {
  const fields = asRecord(value);
  const event = parseEvent(fields.event);
  if (!event || !isText(fields.summary) || !isText(fields.headOid)) return null;
  if (!Array.isArray(fields.comments)) return null;
  const comments = fields.comments.map(parseDraftComment);
  if (!comments.every((comment) => comment !== null)) return null;
  return { headOid: fields.headOid, summary: fields.summary, event, comments };
}
