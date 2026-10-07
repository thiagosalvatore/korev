import type { DiffLang } from '../../design-system';

const HASH_COMMENT_EXTENSIONS = new Set([
  'py',
  'rb',
  'sh',
  'yml',
  'yaml',
  'toml',
  'pl',
  'r',
]);
const JS_EXTENSIONS = new Set(['js', 'jsx', 'mjs', 'cjs']);

export function languageOf(file: string): DiffLang {
  const extension = file.split('.').at(-1)?.toLowerCase() ?? '';
  if (HASH_COMMENT_EXTENSIONS.has(extension)) return 'py';
  if (extension === 'go') return 'go';
  if (JS_EXTENSIONS.has(extension)) return 'js';
  return 'ts';
}
