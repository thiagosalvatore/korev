export type DiffRowType = 'add' | 'del' | 'ctx' | 'hunk';

export interface DiffRow {
  type: DiffRowType;
  code: string;
  oldLine: number | null;
  newLine: number | null;
}

export interface SplitRow {
  left: DiffRow | null;
  right: DiffRow | null;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)/;
const BINARY_MARKER = 'Binary files';

const ROW_TYPES: Record<string, DiffRowType> = {
  '+': 'add',
  '-': 'del',
  ' ': 'ctx',
};

export function isBinaryDiff(patch: string): boolean {
  return patch.split('\n', 6).some((line) => line.startsWith(BINARY_MARKER));
}

export function parseUnifiedDiff(patch: string): DiffRow[] {
  const rows: DiffRow[] = [];
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;
  for (const line of patch.split('\n')) {
    const header = HUNK_HEADER.exec(line);
    if (header) {
      inHunk = true;
      oldLine = Number(header[1]);
      newLine = Number(header[2]);
      rows.push({ type: 'hunk', code: line, oldLine: null, newLine: null });
      continue;
    }
    const type = ROW_TYPES[line.charAt(0)];
    if (!inHunk || !type) continue;
    rows.push({
      type,
      code: line.slice(1),
      oldLine: type === 'add' ? null : oldLine,
      newLine: type === 'del' ? null : newLine,
    });
    if (type !== 'add') oldLine += 1;
    if (type !== 'del') newLine += 1;
  }
  return rows;
}

export function splitRows(rows: DiffRow[]): SplitRow[] {
  const result: SplitRow[] = [];
  let removed: DiffRow[] = [];
  let added: DiffRow[] = [];
  const flush = () => {
    const length = Math.max(removed.length, added.length);
    for (let index = 0; index < length; index += 1) {
      result.push({
        left: removed[index] ?? null,
        right: added[index] ?? null,
      });
    }
    removed = [];
    added = [];
  };
  for (const row of rows) {
    if (row.type === 'del') {
      if (added.length) flush();
      removed.push(row);
    } else if (row.type === 'add') {
      added.push(row);
    } else {
      flush();
      result.push(
        row.type === 'hunk'
          ? { left: row, right: null }
          : { left: row, right: row },
      );
    }
  }
  flush();
  return result;
}

export function patchSignature(patch: string): string {
  let hash = 5381;
  for (let index = 0; index < patch.length; index += 1) {
    hash = ((hash << 5) + hash + patch.charCodeAt(index)) | 0;
  }
  return `${patch.length}:${hash >>> 0}`;
}
