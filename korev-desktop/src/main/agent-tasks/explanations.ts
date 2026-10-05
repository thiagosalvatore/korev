import { marked } from 'marked';
import type { ExplainFormat } from '../../shared/agent-tasks';
import {
  createEncryptedFile,
  hasSecureStorage,
  type SecretCipher,
} from '../encrypted-file';
import type { FileSystem } from '../file-system';

export interface StoredExplanation {
  headOid: string;
  format: ExplainFormat;
  document: string;
  createdAt: string;
}

export interface Explanations {
  load(login: string): Promise<void>;
  get(ref: string): StoredExplanation | null;
  save(ref: string, explanation: StoredExplanation): Promise<void>;
  clear(): Promise<void>;
}

interface ExplanationsFile {
  version: number;
  login: string;
  entries: Record<string, StoredExplanation>;
}

export const EXPLANATIONS_VERSION = 1;
export const KEPT_EXPLANATIONS = 50;

export function explanationBody(explanation: StoredExplanation): string {
  if (explanation.format === 'html') return explanation.document;
  return marked.parse(explanation.document, { async: false });
}

function newestFirst(
  entries: Record<string, StoredExplanation>,
): [string, StoredExplanation][] {
  return Object.entries(entries).sort(([, left], [, right]) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

function parseEntries(
  text: string,
  login: string,
): Record<string, StoredExplanation> {
  try {
    const parsed = JSON.parse(text) as Partial<ExplanationsFile>;
    if (parsed.version !== EXPLANATIONS_VERSION) return {};
    if (parsed.login?.toLowerCase() !== login.toLowerCase()) return {};
    return parsed.entries ?? {};
  } catch {
    return {};
  }
}

export function createExplanations(deps: {
  cipher: SecretCipher;
  fs: FileSystem;
  path: string;
}): Explanations {
  const file = createEncryptedFile(deps);
  let login: string | null = null;
  let entries: Record<string, StoredExplanation> = {};

  async function load(nextLogin: string): Promise<void> {
    login = nextLogin;
    const read = await file.read();
    entries = read.status === 'read' ? parseEntries(read.text, nextLogin) : {};
  }

  async function save(ref: string, explanation: StoredExplanation) {
    entries = Object.fromEntries(
      newestFirst({ ...entries, [ref]: explanation }).slice(
        0,
        KEPT_EXPLANATIONS,
      ),
    );
    if (!login || !(await hasSecureStorage(deps.cipher))) return;
    const contents: ExplanationsFile = {
      version: EXPLANATIONS_VERSION,
      login,
      entries,
    };
    await file.write(JSON.stringify(contents));
  }

  async function clear(): Promise<void> {
    login = null;
    entries = {};
    await file.remove();
  }

  return { load, get: (ref) => entries[ref] ?? null, save, clear };
}
