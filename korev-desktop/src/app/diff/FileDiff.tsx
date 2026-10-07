import { useEffect, useState, type ReactNode } from 'react';
import {
  cn,
  DiffStat,
  highlightCode,
  Icon,
  type DiffLang,
} from '../../design-system';
import {
  isBinaryDiff,
  parseUnifiedDiff,
  patchSignature,
  splitRows,
  type DiffRow,
} from '../../shared/diff';
import type {
  FileChange,
  ReviewComment,
  TurnRange,
  Workspace,
} from '../../shared/model';
import { openFile } from '../actions';
import { api } from '../bridge';
import {
  updateWorkspaceUi,
  type DiffComment,
  type DiffLayout,
} from '../ui-store';
import { CommentForm } from './CommentForm';
import { languageOf } from './language';

const MAX_ROWS_PER_FILE = 3_000;
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
const NUMBER_BUTTON =
  'w-full cursor-pointer border-0 bg-transparent p-0 text-right font-mono text-inherit hover:text-accent-text';

export interface FileDiffProps {
  workspace: Workspace;
  change: FileChange;
  range: TurnRange | null;
  layout: DiffLayout;
  comments: DiffComment[];
  reviewComments: ReviewComment[];
  viewedSignature: string | null;
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function LineNumber({
  line,
  onComment,
}: {
  line: number | null;
  onComment: (line: number) => void;
}) {
  if (line === null) return null;
  return (
    <button
      type="button"
      title="Comment on this line"
      className={NUMBER_BUTTON}
      onClick={() => onComment(line)}
    >
      {line}
    </button>
  );
}

function LocalNote({
  comment,
  onDelete,
}: {
  comment: DiffComment;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-start gap-2 text-sm text-fg-1">
      <Icon
        name="message-square"
        size={13}
        className="mt-0.5 text-accent-text"
      />
      <span className="flex-1 whitespace-pre-wrap">{comment.body}</span>
      <button
        type="button"
        className="cursor-pointer border-0 bg-transparent text-xs text-fg-3 hover:text-danger-text"
        onClick={onDelete}
      >
        Delete
      </button>
    </div>
  );
}

function GithubNote({
  comment,
  onAddToChat,
}: {
  comment: ReviewComment;
  onAddToChat: () => void;
}) {
  return (
    <div className="flex items-start gap-2 text-sm text-fg-1">
      <Icon name="git-pull-request" size={13} className="mt-0.5 text-fg-3" />
      <span className="flex-1 whitespace-pre-wrap">
        <span className="font-medium">@{comment.author}</span> {comment.body}
      </span>
      <button
        type="button"
        className="cursor-pointer border-0 bg-transparent text-xs text-accent-text hover:text-fg-1"
        onClick={onAddToChat}
      >
        Add to chat
      </button>
      <button
        type="button"
        className="cursor-pointer border-0 bg-transparent text-xs text-fg-3 hover:text-fg-1"
        onClick={() => void api.openExternal(comment.url)}
      >
        Open
      </button>
    </div>
  );
}

function useFilePatch(
  workspaceId: string,
  change: FileChange,
  range: TurnRange | null,
) {
  const [patch, setPatch] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    void api.fileDiff(workspaceId, change.path, range).then((text) => {
      if (current) setPatch(text);
    });
    return () => {
      current = false;
    };
  }, [workspaceId, change.path, change.additions, change.deletions, range]);
  return patch;
}

export function FileDiff({
  workspace,
  change,
  range,
  layout,
  comments,
  reviewComments,
  viewedSignature,
}: FileDiffProps) {
  const patch = useFilePatch(workspace.id, change, range);
  const [draftLine, setDraftLine] = useState<number | null>(null);
  const signature = patch === null ? null : patchSignature(patch);
  const viewed = signature !== null && viewedSignature === signature;
  const [collapsed, setCollapsed] = useState(viewed);
  const lang: DiffLang = languageOf(change.path);
  const fileComments = comments.filter(
    (comment) => comment.file === change.path,
  );

  useEffect(() => setCollapsed(viewed), [viewed]);

  function addComment(row: DiffRow, body: string) {
    const comment: DiffComment = {
      id: newId(),
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

  function addReviewComment(review: ReviewComment, row: DiffRow) {
    const comment: DiffComment = {
      id: newId(),
      file: change.path,
      line: review.line ?? 0,
      code: row.code,
      body: `@${review.author} on GitHub: ${review.body}`,
    };
    updateWorkspaceUi(workspace.id, (current) => ({
      comments: [...current.comments, comment],
    }));
  }

  function removeComment(id: string) {
    updateWorkspaceUi(workspace.id, (current) => ({
      comments: current.comments.filter((comment) => comment.id !== id),
    }));
  }

  function setViewed(next: boolean) {
    updateWorkspaceUi(workspace.id, (current) => {
      const map = { ...current.viewed };
      if (next && signature) map[change.path] = signature;
      else delete map[change.path];
      return { viewed: map };
    });
  }

  function notesFor(row: DiffRow, colSpan: number, key: string): ReactNode[] {
    if (row.newLine === null || row.type === 'hunk') return [];
    const notes: ReactNode[] = [];
    for (const comment of fileComments.filter(
      (entry) => entry.line === row.newLine,
    )) {
      notes.push(
        <tr key={`${key}-${comment.id}`} className="kv-diff__note">
          <td colSpan={colSpan}>
            <LocalNote
              comment={comment}
              onDelete={() => removeComment(comment.id)}
            />
          </td>
        </tr>,
      );
    }
    for (const review of reviewComments.filter(
      (entry) => entry.line === row.newLine,
    )) {
      notes.push(
        <tr key={`${key}-gh-${review.id}`} className="kv-diff__note">
          <td colSpan={colSpan}>
            <GithubNote
              comment={review}
              onAddToChat={() => addReviewComment(review, row)}
            />
          </td>
        </tr>,
      );
    }
    if (draftLine !== null && row.newLine === draftLine) {
      notes.push(
        <tr key={`${key}-draft`} className="kv-diff__note">
          <td colSpan={colSpan}>
            <CommentForm
              onSave={(text) => addComment(row, text)}
              onCancel={() => setDraftLine(null)}
            />
          </td>
        </tr>,
      );
    }
    return notes;
  }

  function unifiedBody(rows: DiffRow[]) {
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
                  <td className="kv-diff__num">
                    <LineNumber line={row.newLine} onComment={setDraftLine} />
                  </td>
                  <td className="kv-diff__sign">{SIGNS[row.type]}</td>
                  <td className="kv-diff__code">
                    {highlightCode(row.code, lang)}
                  </td>
                </>
              )}
            </tr>,
            ...notesFor(row, 4, String(index)),
          ])}
        </tbody>
      </table>
    );
  }

  function splitCell(row: DiffRow | null, side: 'old' | 'new') {
    if (!row)
      return [
        <td key="n" className="kv-diff__num bg-inset" />,
        <td key="c" className="bg-inset" />,
      ];
    const line = side === 'old' ? row.oldLine : row.newLine;
    return [
      <td key="n" className={cn('kv-diff__num', ROW_CLASS[row.type])}>
        {side === 'new' ? (
          <LineNumber line={line} onComment={setDraftLine} />
        ) : (
          (line ?? '')
        )}
      </td>,
      <td key="c" className={cn('kv-diff__code pl-2', ROW_CLASS[row.type])}>
        {highlightCode(row.code, lang)}
      </td>,
    ];
  }

  function splitBody(rows: DiffRow[]) {
    return (
      <table>
        <colgroup>
          <col className="w-11" />
          <col className="w-1/2" />
          <col className="w-11" />
          <col className="w-1/2" />
        </colgroup>
        <tbody>
          {splitRows(rows).flatMap((pair, index) => {
            if (pair.left?.type === 'hunk') {
              return [
                <tr key={index} className="kv-diff__row--hunk">
                  <td className="kv-diff__num" />
                  <td colSpan={3} className="pl-2">
                    {pair.left.code}
                  </td>
                </tr>,
              ];
            }
            return [
              <tr key={index}>
                {splitCell(pair.left, 'old')}
                {splitCell(pair.right, 'new')}
              </tr>,
              ...(pair.right ? notesFor(pair.right, 4, String(index)) : []),
            ];
          })}
        </tbody>
      </table>
    );
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
  else
    body = (
      <div className="kv-diff">
        {layout === 'split' ? splitBody(rows) : unifiedBody(rows)}
      </div>
    );

  return (
    <section
      id={`diff-${change.path}`}
      aria-label={change.path}
      className="border-b border-border-1"
    >
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
        <span
          className={cn(
            'min-w-0 flex-1 truncate font-mono text-xs',
            viewed ? 'text-fg-3' : 'text-fg-1',
          )}
        >
          {change.path}
        </span>
        <DiffStat additions={change.additions} deletions={change.deletions} />
        <label
          className="flex cursor-pointer items-center gap-1.5 text-xs text-fg-3"
          title="Mark as viewed (it comes back if the file changes)"
        >
          <input
            type="checkbox"
            checked={viewed}
            disabled={signature === null}
            onChange={(event) => setViewed(event.target.checked)}
          />
          Viewed
        </label>
        {range ? null : (
          <button
            type="button"
            title="Edit file"
            className="cursor-pointer border-0 bg-transparent p-0 text-fg-3 hover:text-fg-1"
            onClick={() =>
              openFile(workspace.id, change.path, { editing: true })
            }
          >
            <Icon name="pencil" size={14} />
          </button>
        )}
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
