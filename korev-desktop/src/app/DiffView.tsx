import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Button,
  cn,
  DiffStat,
  FileRow,
  highlightCode,
  Icon,
  type DiffLang,
} from '../design-system';
import { isBinaryDiff, parseUnifiedDiff, type DiffRow } from '../shared/diff';
import type { FileChange, Workspace } from '../shared/model';
import { openFile } from './actions';
import { api } from './bridge';
import { usePolling } from './hooks';
import {
  EMPTY_WORKSPACE_UI,
  updateWorkspaceUi,
  useUi,
  type DiffComment,
} from './ui-store';

const REFRESH_MS = 4_000;
const MAX_ROWS_PER_FILE = 3_000;
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
const ROW_CLASS: Record<DiffRow['type'], string> = {
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

export function languageOf(file: string): DiffLang {
  const extension = file.split('.').at(-1)?.toLowerCase() ?? '';
  if (HASH_COMMENT_EXTENSIONS.has(extension)) return 'py';
  if (extension === 'go') return 'go';
  if (extension === 'js' || extension === 'jsx' || extension === 'mjs')
    return 'js';
  return 'ts';
}

function CommentForm({
  onSave,
  onCancel,
}: {
  onSave: (body: string) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState('');
  return (
    <div className="flex flex-col gap-2 py-1">
      <textarea
        autoFocus
        aria-label="Comment"
        value={body}
        placeholder="Leave a comment for the agent"
        className="min-h-16 w-full max-w-2xl resize-y rounded-md border border-border-2 bg-raised p-2 font-sans text-sm text-fg-1 outline-none focus:border-accent-border"
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel();
          if (
            event.key === 'Enter' &&
            (event.metaKey || event.ctrlKey) &&
            body.trim()
          )
            onSave(body.trim());
        }}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="primary"
          disabled={!body.trim()}
          onClick={() => onSave(body.trim())}
        >
          Add comment
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function FileDiff({
  workspace,
  change,
  comments,
}: {
  workspace: Workspace;
  change: FileChange;
  comments: DiffComment[];
}) {
  const [patch, setPatch] = useState<string | null>(null);
  const [draftLine, setDraftLine] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const lang = languageOf(change.path);

  useEffect(() => {
    let current = true;
    void api.fileDiff(workspace.id, change.path).then((text) => {
      if (current) setPatch(text);
    });
    return () => {
      current = false;
    };
  }, [workspace.id, change.path, change.additions, change.deletions]);

  function addComment(row: DiffRow, body: string) {
    const comment: DiffComment = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file: change.path,
      line: row.newLine ?? 0,
      code: row.code,
      body,
    };
    updateWorkspaceUi(workspace.id, (current) => ({
      comments: [...current.comments, comment],
    }));
    setDraftLine(null);
  }

  function removeComment(id: string) {
    updateWorkspaceUi(workspace.id, (current) => ({
      comments: current.comments.filter((comment) => comment.id !== id),
    }));
  }

  const rows = patch ? parseUnifiedDiff(patch).slice(0, MAX_ROWS_PER_FILE) : [];
  let body: ReactNode;
  if (patch === null)
    body = <p className="m-0 px-4 py-3 text-sm text-fg-3">Loading…</p>;
  else if (isBinaryDiff(patch))
    body = <p className="m-0 px-4 py-3 text-sm text-fg-3">Binary file</p>;
  else if (!rows.length)
    body = (
      <p className="m-0 px-4 py-3 text-sm text-fg-3">No textual changes</p>
    );
  else {
    body = (
      <div className="kv-diff">
        <table>
          <colgroup>
            <col className="w-12" />
            <col className="w-4.5" />
            <col />
          </colgroup>
          <tbody>
            {rows.flatMap((row, index) => {
              const lineComments = comments.filter(
                (comment) =>
                  comment.file === change.path &&
                  row.newLine !== null &&
                  comment.line === row.newLine,
              );
              const cells = [
                <tr key={index} className={ROW_CLASS[row.type]}>
                  {row.type === 'hunk' ? (
                    <>
                      <td className="kv-diff__num" />
                      <td colSpan={2} className="pl-2">
                        {row.code}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="kv-diff__num">
                        {row.newLine !== null ? (
                          <button
                            type="button"
                            title="Comment on this line"
                            className="w-full cursor-pointer border-0 bg-transparent p-0 text-right font-mono text-inherit hover:text-accent-text"
                            onClick={() => setDraftLine(row.newLine)}
                          >
                            {row.newLine}
                          </button>
                        ) : null}
                      </td>
                      <td className="kv-diff__sign">{SIGNS[row.type]}</td>
                      <td className="kv-diff__code">
                        {highlightCode(row.code, lang)}
                      </td>
                    </>
                  )}
                </tr>,
              ];
              for (const comment of lineComments) {
                cells.push(
                  <tr key={comment.id} className="kv-diff__note">
                    <td colSpan={3}>
                      <div className="flex items-start gap-2 text-sm text-fg-1">
                        <Icon
                          name="message-square"
                          size={13}
                          className="mt-0.5 text-accent-text"
                        />
                        <span className="flex-1 whitespace-pre-wrap">
                          {comment.body}
                        </span>
                        <button
                          type="button"
                          className="cursor-pointer border-0 bg-transparent text-xs text-fg-3 hover:text-danger-text"
                          onClick={() => removeComment(comment.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>,
                );
              }
              if (
                draftLine !== null &&
                row.newLine === draftLine &&
                row.type !== 'hunk'
              ) {
                cells.push(
                  <tr key={`draft-${index}`} className="kv-diff__note">
                    <td colSpan={3}>
                      <CommentForm
                        onSave={(text) => addComment(row, text)}
                        onCancel={() => setDraftLine(null)}
                      />
                    </td>
                  </tr>,
                );
              }
              return cells;
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <section id={`diff-${change.path}`} className="border-b border-border-1">
      <header className="sticky top-0 z-10 flex h-9 items-center gap-2 border-b border-border-1 bg-surface px-3">
        <button
          type="button"
          aria-label={collapsed ? 'Expand file' : 'Collapse file'}
          className="cursor-pointer border-0 bg-transparent p-0 text-fg-3"
          onClick={() => setCollapsed((value) => !value)}
        >
          <Icon
            name="chevron-down"
            size={14}
            className={cn('transition-transform', collapsed && '-rotate-90')}
          />
        </button>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-1">
          {change.path}
        </span>
        <DiffStat additions={change.additions} deletions={change.deletions} />
        <button
          type="button"
          title="Open file"
          className="cursor-pointer border-0 bg-transparent p-0 text-fg-3 hover:text-fg-1"
          onClick={() => openFile(workspace.id, change.path)}
        >
          <Icon name="file-symlink" size={14} />
        </button>
      </header>
      {collapsed ? null : body}
    </section>
  );
}

export interface DiffViewProps {
  workspace: Workspace;
  focusFile: string | null;
  onSendComments: () => void;
}

export function DiffView({
  workspace,
  focusFile,
  onSendComments,
}: DiffViewProps) {
  const [changes, setChanges] = useState<FileChange[] | null>(null);
  const comments = useUi(
    (ui) => (ui.workspaces[workspace.id] ?? EMPTY_WORKSPACE_UI).comments,
  );
  const scroller = useRef<HTMLDivElement>(null);

  usePolling(
    () => {
      if (workspace.archivedAt) return;
      void api.changes(workspace.id).then(setChanges);
    },
    REFRESH_MS,
    [workspace.id],
  );

  useEffect(() => {
    if (!focusFile || !changes) return;
    document
      .getElementById(`diff-${focusFile}`)
      ?.scrollIntoView({ block: 'start' });
  }, [focusFile, changes]);

  if (!changes) return <div className="flex-1" />;
  if (!changes.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-fg-3">
        <Icon name="git-compare" size={22} />
        <p className="m-0 text-sm">
          No changes yet compared to origin/{workspace.baseBranch}
        </p>
      </div>
    );
  }
  const additions = changes.reduce((sum, change) => sum + change.additions, 0);
  const deletions = changes.reduce((sum, change) => sum + change.deletions, 0);
  return (
    <div className="flex min-h-0 flex-1">
      <aside
        aria-label="Changed files"
        className="flex w-60 flex-none flex-col border-r border-border-1 bg-surface"
      >
        <div className="flex h-9 items-center justify-between border-b border-border-1 px-3 text-xs text-fg-3">
          <span>{changes.length} files</span>
          <DiffStat
            additions={additions}
            deletions={deletions}
            showBar={false}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          {changes.map((change) => (
            <FileRow
              key={change.path}
              path={change.path}
              status={change.status}
              additions={change.additions}
              deletions={change.deletions}
              onClick={() =>
                document
                  .getElementById(`diff-${change.path}`)
                  ?.scrollIntoView({ block: 'start' })
              }
            />
          ))}
        </div>
        {comments.length ? (
          <div className="border-t border-border-1 p-2">
            <Button
              size="sm"
              variant="primary"
              icon="send"
              className="w-full"
              onClick={onSendComments}
            >
              {comments.length} comment{comments.length === 1 ? '' : 's'} ready
              to send
            </Button>
          </div>
        ) : null}
      </aside>
      <div ref={scroller} className="min-h-0 min-w-0 flex-1 overflow-auto">
        {changes.map((change) => (
          <FileDiff
            key={change.path}
            workspace={workspace}
            change={change}
            comments={comments}
          />
        ))}
      </div>
    </div>
  );
}
