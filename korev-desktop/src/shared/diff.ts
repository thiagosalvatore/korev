export type DiffRowType = 'add' | 'del' | 'ctx' | 'hunk';

export interface DiffRow {
  type: DiffRowType;
  code: string;
  newLine: number | null;
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)/;
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
  let newLine = 0;
  let inHunk = false;
  for (const line of patch.split('\n')) {
    const header = HUNK_HEADER.exec(line);
    if (header) {
      inHunk = true;
      newLine = Number(header[1]);
      rows.push({ type: 'hunk', code: line, newLine: null });
      continue;
    }
    const type = ROW_TYPES[line.charAt(0)];
    if (!inHunk || !type) continue;
    rows.push({
      type,
      code: line.slice(1),
      newLine: type === 'del' ? null : newLine,
    });
    if (type !== 'del') newLine += 1;
  }
  return rows;
}
