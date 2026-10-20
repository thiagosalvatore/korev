import type { ReactNode } from 'react';
import { highlightCode, type DiffLang } from '../../design-system';
import type { DiffRow } from '../../shared/diff';

export const ROW_CLASS: Record<DiffRow['type'], string> = {
  add: 'kv-diff__row--add',
  del: 'kv-diff__row--del',
  ctx: '',
  hunk: 'kv-diff__row--hunk',
};
const SIGNS: Record<DiffRow['type'], string> = {
  add: '+',
  del: '−',
  ctx: ' ',
  hunk: '',
};
const UNIFIED_COLUMNS = 4;

export function UnifiedRows({
  rows,
  lang,
  newLine = (line) => line ?? '',
  notes = () => [],
}: {
  rows: DiffRow[];
  lang: DiffLang;
  newLine?: (line: number | null) => ReactNode;
  notes?: (row: DiffRow, colSpan: number, key: string) => ReactNode[];
}) {
  return (
    <table>
      <colgroup>
        <col className="w-11" />
        <col className="w-11" />
        <col className="w-4.5" />
        <col />
      </colgroup>
      <tbody>
        {rows.flatMap((row, index) => [
          <tr key={index} className={ROW_CLASS[row.type]}>
            {row.type === 'hunk' ? (
              <>
                <td className="kv-diff__num" />
                <td className="kv-diff__num" />
                <td colSpan={2} className="pl-2">
                  {row.code}
                </td>
              </>
            ) : (
              <>
                <td className="kv-diff__num">{row.oldLine ?? ''}</td>
                <td className="kv-diff__num">{newLine(row.newLine)}</td>
                <td className="kv-diff__sign">{SIGNS[row.type]}</td>
                <td className="kv-diff__code">
                  {highlightCode(row.code, lang)}
                </td>
              </>
            )}
          </tr>,
          ...notes(row, UNIFIED_COLUMNS, String(index)),
        ])}
      </tbody>
    </table>
  );
}
