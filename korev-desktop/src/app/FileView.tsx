import { useEffect, useState } from 'react';
import { highlightCode, Icon } from '../design-system';
import type { Workspace } from '../shared/model';
import { api } from './bridge';
import { languageOf } from './DiffView';

export function FileView({
  workspace,
  file,
}: {
  workspace: Workspace;
  file: string;
}) {
  const [contents, setContents] = useState<string | null | undefined>(
    undefined,
  );
  useEffect(() => {
    setContents(undefined);
    void api.readFile(workspace.id, file).then(setContents);
  }, [workspace.id, file]);

  if (contents === undefined) return <div className="flex-1" />;
  if (contents === null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-fg-3">
        <Icon name="file-x" size={22} />
        <p className="m-0 text-sm">This file can't be shown here.</p>
      </div>
    );
  }
  const lang = languageOf(file);
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="sticky top-0 z-10 flex h-9 items-center border-b border-border-1 bg-surface px-3 font-mono text-xs text-fg-2">
        {file}
      </div>
      <div className="kv-diff">
        <table>
          <colgroup>
            <col className="w-12" />
            <col />
          </colgroup>
          <tbody>
            {contents.split('\n').map((line, index) => (
              <tr key={index}>
                <td className="kv-diff__num">{index + 1}</td>
                <td className="kv-diff__code pl-3">
                  {highlightCode(line, lang)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
