import { useEffect, useRef, useState } from 'react';
import { Button, cn, highlightCode, Icon, Spinner } from '../design-system';
import type { Workspace } from '../shared/model';
import { api } from './bridge';
import { Markdown } from './chat/Markdown';
import { languageOf } from './diff/language';
import { reportFailure, toast } from './ui/toast';

const MARKDOWN_FILE = /\.(md|markdown)$/i;

function isOutsideWorkspace(file: string): boolean {
  return file.startsWith('~') || file.startsWith('/');
}

function SourceLines({
  contents,
  file,
  line,
}: {
  contents: string;
  file: string;
  line: number | null;
}) {
  const highlighted = useRef<HTMLTableRowElement>(null);
  const lang = languageOf(file);

  useEffect(() => {
    highlighted.current?.scrollIntoView({ block: 'center' });
  }, [contents, line]);

  return (
    <div className="kv-diff">
      <table>
        <colgroup>
          <col className="w-12" />
          <col />
        </colgroup>
        <tbody>
          {contents.split('\n').map((text, index) => (
            <tr
              key={index}
              ref={index + 1 === line ? highlighted : undefined}
              className={cn(index + 1 === line && 'bg-accent-subtle')}
            >
              <td className="kv-diff__num">{index + 1}</td>
              <td className="kv-diff__code pl-3">
                {highlightCode(text, lang)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface FileViewProps {
  workspace: Workspace;
  file: string;
  line: number | null;
  editing: boolean;
}

function Editor({
  value,
  onChange,
  onSave,
}: {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <textarea
      autoFocus
      aria-label="File contents"
      spellCheck={false}
      value={value}
      className="min-h-0 flex-1 resize-none border-0 bg-inset p-3 font-mono text-code text-fg-1 outline-none focus-visible:shadow-none"
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === 's'
        ) {
          event.preventDefault();
          onSave();
        }
        if (event.key === 'Tab') {
          event.preventDefault();
          const target = event.currentTarget;
          const { selectionStart, selectionEnd } = target;
          onChange(
            `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`,
          );
          requestAnimationFrame(() =>
            target.setSelectionRange(selectionStart + 2, selectionStart + 2),
          );
        }
      }}
    />
  );
}

export function FileView({
  workspace,
  file,
  line,
  editing: startEditing,
}: FileViewProps) {
  const [contents, setContents] = useState<string | null | undefined>(
    undefined,
  );
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    setContents(undefined);
    void api.readFile(workspace.id, file).then((text) => {
      setContents(text);
      setDraft(text ?? '');
    });
  }, [workspace.id, file]);

  async function save() {
    const result = await api.writeFile(workspace.id, file, draft);
    if (!reportFailure(result)) return;
    setContents(draft);
    setEditing(false);
    toast(`Saved ${file}`, 'success');
  }

  if (contents === undefined) return <Spinner />;
  if (contents === null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-fg-3">
        <Icon name="file-x" size={22} />
        <p className="m-0 text-sm">This file can't be shown here.</p>
      </div>
    );
  }
  const dirty = draft !== contents;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 flex-none items-center gap-2 border-b border-border-1 bg-surface px-3">
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-2">
          {file}
          {dirty ? <span className="ml-1 text-warning-text">●</span> : null}
        </span>
        {editing ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(contents);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!dirty}
              title="⌘S"
              onClick={() => save()}
            >
              Save
            </Button>
          </>
        ) : isOutsideWorkspace(file) ? null : (
          <Button
            size="sm"
            variant="ghost"
            icon="pencil"
            onClick={() => setEditing(true)}
          >
            Edit
          </Button>
        )}
      </div>
      {editing ? (
        <Editor value={draft} onChange={setDraft} onSave={() => void save()} />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          {MARKDOWN_FILE.test(file) ? (
            <Markdown text={contents} className="p-4" />
          ) : (
            <SourceLines contents={contents} file={file} line={line} />
          )}
        </div>
      )}
    </div>
  );
}
