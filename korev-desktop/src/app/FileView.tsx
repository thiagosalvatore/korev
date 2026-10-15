import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import type { ThemedToken } from 'shiki/core';
import { Button, cn, Icon, Spinner } from '../design-system';
import { fileName, imageType } from '../shared/format';
import type { Workspace } from '../shared/model';
import { api } from './bridge';
import { Markdown } from './chat/Markdown';
import { highlightFile } from './highlightFile';
import { reportFailure, toast } from './ui/toast';

const MARKDOWN_FILE = /\.(md|markdown)$/i;
const SAVE_KEY = 's';
const SELECT_ALL_KEY = 'a';

function isShortcut(event: KeyboardEvent, key: string): boolean {
  return (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === key;
}

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
  const [tokens, setTokens] = useState<ThemedToken[][] | null>(null);

  useEffect(() => {
    highlighted.current?.scrollIntoView({ block: 'center' });
  }, [contents, line]);

  useEffect(() => {
    let current = true;
    setTokens(null);
    void highlightFile(contents, file).then((result) => {
      if (current) setTokens(result);
    });
    return () => {
      current = false;
    };
  }, [contents, file]);

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
                {tokens?.[index]?.map((token, position) => (
                  <span key={position} style={{ color: token.color }}>
                    {token.content}
                  </span>
                )) ?? text}
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
        if (isShortcut(event, SAVE_KEY)) {
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

function ReadOnlyContents({
  file,
  children,
}: {
  file: string;
  children: ReactNode;
}) {
  const contents = useRef<HTMLDivElement>(null);

  useEffect(() => {
    contents.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      ref={contents}
      role="region"
      aria-label={file}
      tabIndex={0}
      className="min-h-0 flex-1 overflow-auto outline-none"
      onKeyDown={(event) => {
        if (!isShortcut(event, SELECT_ALL_KEY)) return;
        event.preventDefault();
        window.getSelection()?.selectAllChildren(event.currentTarget);
      }}
    >
      {children}
    </div>
  );
}

function Unavailable() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-fg-3">
      <Icon name="file-x" size={22} />
      <p className="m-0 text-sm">This file can't be shown here.</p>
    </div>
  );
}

function FileHeader({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-9 flex-none items-center gap-2 border-b border-border-1 bg-surface px-3">
      {children}
    </div>
  );
}

function ImageFile({ workspace, file }: FileViewProps) {
  const [source, setSource] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    setSource(undefined);
    void api.readWorkspaceImage(workspace.id, file).then(setSource);
  }, [workspace.id, file]);

  if (source === undefined) return <Spinner />;
  if (source === null) return <Unavailable />;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FileHeader>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-2">
          {file}
        </span>
      </FileHeader>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
        <img
          src={source}
          alt={fileName(file)}
          className="max-h-full max-w-full"
        />
      </div>
    </div>
  );
}

export function FileView(props: FileViewProps) {
  return imageType(props.file) ? (
    <ImageFile {...props} />
  ) : (
    <TextFile {...props} />
  );
}

function TextFile({
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
  if (contents === null) return <Unavailable />;
  const dirty = draft !== contents;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FileHeader>
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
      </FileHeader>
      {editing ? (
        <Editor value={draft} onChange={setDraft} onSave={() => void save()} />
      ) : (
        <ReadOnlyContents file={file}>
          {MARKDOWN_FILE.test(file) ? (
            <Markdown text={contents} className="p-4" />
          ) : (
            <SourceLines contents={contents} file={file} line={line} />
          )}
        </ReadOnlyContents>
      )}
    </div>
  );
}
