import { parseUnifiedDiff, type DiffRow } from './diff';
import type { Result } from './model';

export const EXPLAINER_FENCE = 'korev-explainer';
export const RISK_LEVELS = ['high', 'medium', 'low'] as const;

export type RiskLevel = (typeof RISK_LEVELS)[number];

export type ExplainerTarget =
  | { kind: 'pr'; repoId: string; number: number }
  | { kind: 'workspace'; workspaceId: string };

export type ExplainerStatus = 'writing' | 'ready' | 'failed';

export interface StackLayer {
  number: number;
  title: string;
  url: string;
}

export interface ExplainerRef {
  target: ExplainerTarget;
  title: string;
  url: string | null;
  author: string | null;
  stack?: StackLayer[];
  revision: string;
  status: ExplainerStatus;
  error?: string;
}

export interface CodeChange {
  file: string;
  startLine?: number;
  endLine?: number;
}

export interface TourStep {
  title: string;
  explanation: string;
  why: string;
  changes: CodeChange[];
  pr?: number;
}

export interface LayerSummary {
  pr: number;
  summary: string;
}

export interface Risk {
  level: RiskLevel;
  title: string;
  explanation: string;
  file?: string;
}

export interface ExplainerContent {
  headline: string;
  summary: string;
  before: string;
  after: string;
  flow: { label: string; detail: string }[];
  tour: TourStep[];
  risks: Risk[];
  questions: string[];
  routine: { file: string; reason: string }[];
  glossary: { term: string; meaning: string }[];
  layers?: LayerSummary[];
}

export interface Explainer {
  ref: ExplainerRef;
  content: ExplainerContent | null;
  patch: string;
  latestRevision: string | null;
}

export interface ExplainerOpened {
  sessionId: string;
  askChatId: string | null;
}

export interface FilePatch {
  path: string;
  deleted: boolean;
  patch: string;
  pr: number | null;
}

export interface LayerPatch {
  number: number;
  title: string;
  patch: string;
}

type Json = Record<string, unknown>;

class ShapeError extends Error {}

function record(value: unknown, at: string): Json {
  if (value && typeof value === 'object' && !Array.isArray(value))
    return value as Json;
  throw new ShapeError(`${at} must be an object`);
}

function text(value: unknown, at: string): string {
  if (typeof value === 'string') return value;
  throw new ShapeError(`${at} must be text`);
}

function optionalText(value: unknown, at: string): string | undefined {
  return value === undefined || value === null ? undefined : text(value, at);
}

function optionalLine(value: unknown, at: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (Number.isInteger(value) && (value as number) > 0) return value as number;
  throw new ShapeError(`${at} must be a line number`);
}

function list<T>(
  value: unknown,
  at: string,
  read: (entry: unknown, at: string) => T,
): T[] {
  if (!Array.isArray(value)) throw new ShapeError(`${at} must be a list`);
  return value.map((entry, index) => read(entry, `${at}[${index}]`));
}

function riskLevel(value: unknown, at: string): RiskLevel {
  const level = RISK_LEVELS.find((entry) => entry === value);
  if (level) return level;
  throw new ShapeError(`${at} must be one of ${RISK_LEVELS.join(', ')}`);
}

function codeChange(value: unknown, at: string): CodeChange {
  const entry = record(value, at);
  const change: CodeChange = { file: text(entry.file, `${at}.file`) };
  const startLine = optionalLine(entry.startLine, `${at}.startLine`);
  const endLine = optionalLine(entry.endLine, `${at}.endLine`);
  if (startLine !== undefined) change.startLine = startLine;
  if (endLine !== undefined) change.endLine = endLine;
  return change;
}

function optionalNumber(value: unknown, at: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (Number.isInteger(value)) return value as number;
  throw new ShapeError(`${at} must be a pull request number`);
}

function tourStep(value: unknown, at: string): TourStep {
  const entry = record(value, at);
  const step: TourStep = {
    title: text(entry.title, `${at}.title`),
    explanation: text(entry.explanation, `${at}.explanation`),
    why: text(entry.why, `${at}.why`),
    changes: list(entry.changes, `${at}.changes`, codeChange),
  };
  const pr = optionalNumber(entry.pr, `${at}.pr`);
  if (pr !== undefined) step.pr = pr;
  return step;
}

function layerSummary(value: unknown, at: string): LayerSummary {
  const entry = record(value, at);
  const pr = optionalNumber(entry.pr, `${at}.pr`);
  if (pr === undefined)
    throw new ShapeError(`${at}.pr must be a pull request number`);
  return { pr, summary: text(entry.summary, `${at}.summary`) };
}

function risk(value: unknown, at: string): Risk {
  const entry = record(value, at);
  const parsed: Risk = {
    level: riskLevel(entry.level, `${at}.level`),
    title: text(entry.title, `${at}.title`),
    explanation: text(entry.explanation, `${at}.explanation`),
  };
  const file = optionalText(entry.file, `${at}.file`);
  if (file) parsed.file = file;
  return parsed;
}

function pair<K extends string, V extends string>(key: K, value: V) {
  return (entry: unknown, at: string) => {
    const fields = record(entry, at);
    return {
      [key]: text(fields[key], `${at}.${key}`),
      [value]: text(fields[value], `${at}.${value}`),
    } as Record<K | V, string>;
  };
}

function content(value: unknown): ExplainerContent {
  const root = record(value, 'explanation');
  const tour = list(root.tour, 'tour', tourStep);
  if (!tour.length) throw new ShapeError('tour must have at least one step');
  const parsed: ExplainerContent = {
    headline: text(root.headline, 'headline'),
    summary: text(root.summary, 'summary'),
    before: text(root.before, 'before'),
    after: text(root.after, 'after'),
    flow: list(root.flow, 'flow', pair('label', 'detail')),
    tour,
    risks: list(root.risks, 'risks', risk),
    questions: list(root.questions, 'questions', text),
    routine: list(root.routine, 'routine', pair('file', 'reason')),
    glossary: list(root.glossary, 'glossary', pair('term', 'meaning')),
  };
  if (root.layers !== undefined && root.layers !== null)
    parsed.layers = list(root.layers, 'layers', layerSummary);
  return parsed;
}

const FENCE_PATTERN = new RegExp(
  `\`\`\`${EXPLAINER_FENCE}[^\\n]*\\n([\\s\\S]*?)\\n\`\`\``,
  'g',
);

export function explainerBlock(reply: string): string | null {
  return [...reply.matchAll(FENCE_PATTERN)].at(-1)?.[1] ?? null;
}

export function withoutExplainerBlocks(reply: string): string {
  return reply.replace(FENCE_PATTERN, '').trim();
}

export function hasExplainerBlock(reply: string): boolean {
  return explainerBlock(reply) !== null;
}

export function parseExplainer(reply: string): Result<ExplainerContent> {
  const block = explainerBlock(reply);
  if (block === null)
    return {
      ok: false,
      message: `The reply has no \`\`\`${EXPLAINER_FENCE} block`,
    };
  try {
    return { ok: true, value: content(JSON.parse(block)) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message };
  }
}

const FILE_HEADER = /^diff --git a\/(.+) b\/(.+)$/;
const NEW_PATH = /^\+\+\+ b\/(.+)$/m;
const DELETED_FILE = /^deleted file mode/m;

const LAYER_HEADER = /^### Pull request #(\d+)/;

function filePatch(patch: string, pr: number | null): FilePatch {
  const header = FILE_HEADER.exec(patch.split('\n', 1)[0]);
  const deleted = DELETED_FILE.test(patch);
  const path = NEW_PATH.exec(patch)?.[1] ?? header?.[2] ?? '';
  return { path, deleted, patch, pr };
}

export function stackPatch(layers: LayerPatch[]): string {
  return layers
    .map(
      (layer) =>
        `### Pull request #${layer.number}: ${layer.title}\n${layer.patch}`,
    )
    .join('\n');
}

export function changedFiles(patch: string): FilePatch[] {
  let pr: number | null = null;
  const files: FilePatch[] = [];
  for (const part of patch.split(/^(?=diff --git |### Pull request #)/m)) {
    const layer = LAYER_HEADER.exec(part);
    if (layer) pr = Number(layer[1]);
    else if (part.startsWith('diff --git ')) files.push(filePatch(part, pr));
  }
  return files;
}

export function findFilePatch(
  files: FilePatch[],
  path: string,
  pr?: number,
): FilePatch | undefined {
  const inFile = (file: FilePatch) => file.path === path;
  return (
    files.findLast((file) => inFile(file) && file.pr === pr) ??
    files.findLast(inFile)
  );
}

export function explainedFiles(content: ExplainerContent): Set<string> {
  return new Set([
    ...content.tour.flatMap((step) =>
      step.changes.map((change) => change.file),
    ),
    ...content.routine.map((entry) => entry.file),
  ]);
}

export function uncoveredFiles(
  content: ExplainerContent,
  patch: string,
): string[] {
  const explained = explainedFiles(content);
  const changed = new Set(changedFiles(patch).map((file) => file.path));
  return [...changed].filter((path) => !explained.has(path));
}

function hunks(rows: DiffRow[]): DiffRow[][] {
  const groups: DiffRow[][] = [];
  for (const row of rows) {
    if (row.type === 'hunk' || !groups.length) groups.push([]);
    groups[groups.length - 1].push(row);
  }
  return groups;
}

export function hunksForChange(file: FilePatch, change: CodeChange): DiffRow[] {
  const rows = parseUnifiedDiff(file.patch);
  if (change.startLine === undefined) return rows;
  const start = change.startLine;
  const end = Math.max(change.endLine ?? start, start);
  const cited = (row: DiffRow) => {
    const line = file.deleted ? row.oldLine : row.newLine;
    return line !== null && line >= start && line <= end;
  };
  return hunks(rows)
    .filter((hunk) => hunk.some(cited))
    .flat();
}

const PR_URL = /github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/;

export function parsePrUrl(
  url: string,
): { owner: string; repo: string; number: number } | null {
  const match = PR_URL.exec(url);
  if (!match) return null;
  return { owner: match[1], repo: match[2], number: Number(match[3]) };
}
