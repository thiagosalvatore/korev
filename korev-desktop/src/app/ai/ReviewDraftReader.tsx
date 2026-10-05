import { useState } from 'react';
import {
  Button,
  DiffHunk,
  Dialog,
  Field,
  Finding,
  type DiffLang,
  type DiffLine,
} from '../../design-system';
import type {
  ReviewComment,
  ReviewDraft,
  ReviewEvent,
} from '../../shared/agent-tasks';
import type { PrTarget } from '../../shared/merge';
import { korev } from '../bridge';
import { pluralize } from '../format';
import { announce } from '../LiveAnnouncer';

const READER_WIDTH = 'min(960px, calc(100vw - 32px))';
const TEXTAREA_CLASS =
  'min-h-16 w-full resize-y rounded-sm border border-border-2 bg-inset p-2.5 type-ui text-fg-1 outline-none hover:border-border-strong focus:border-accent focus:shadow-halo';
const LANG_BY_EXTENSION: Record<string, DiffLang> = {
  ts: 'ts',
  tsx: 'ts',
  js: 'js',
  jsx: 'js',
  mjs: 'js',
  py: 'py',
  go: 'go',
};

function langOf(path: string): DiffLang | undefined {
  return LANG_BY_EXTENSION[path.split('.').at(-1) ?? ''];
}

function contextLines(comment: ReviewComment): DiffLine[] {
  return comment.context.map((code, index) => ({
    type: 'ctx',
    code,
    flag: comment.contextStart + index === comment.line,
  }));
}

function isPosted(comment: ReviewComment): boolean {
  return comment.status !== 'dismissed';
}

interface CommentCardProps {
  comment: ReviewComment;
  onChange: (comment: ReviewComment) => void;
}

function CommentCard({ comment, onChange }: CommentCardProps) {
  const [editing, setEditing] = useState(false);
  const lang = langOf(comment.path);
  const setStatus = (status: ReviewComment['status']) =>
    onChange({
      ...comment,
      status: comment.status === status ? 'open' : status,
    });
  return (
    <Finding
      level={comment.severity}
      title={
        editing ? (
          <textarea
            aria-label={`Comment on ${comment.path}:${comment.line}`}
            className={TEXTAREA_CLASS}
            value={comment.body}
            autoFocus
            onChange={(event) =>
              onChange({ ...comment, body: event.target.value })
            }
            onBlur={() => setEditing(false)}
          />
        ) : (
          <button
            type="button"
            className="cursor-text border-0 bg-transparent p-0 text-left font-inherit text-inherit"
            onClick={() => setEditing(true)}
          >
            {comment.body}
          </button>
        )
      }
      location={`${comment.path}:${comment.line}`}
      status={comment.status}
      actions={
        <>
          <Button size="sm" onClick={() => setStatus('accepted')}>
            {comment.status === 'accepted' ? 'Accepted' : 'Accept'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setStatus('dismissed')}
          >
            {comment.status === 'dismissed' ? 'Keep' : 'Dismiss'}
          </Button>
        </>
      }
    >
      {comment.context.length > 0 ? (
        <div className="overflow-x-auto">
          <DiffHunk
            lines={contextLines(comment)}
            oldStart={comment.contextStart}
            newStart={comment.contextStart}
            lang={lang}
            highlight={lang !== undefined}
          />
        </div>
      ) : null}
    </Finding>
  );
}

export interface ReviewDraftReaderProps {
  target: PrTarget;
  title: string;
  draft: ReviewDraft;
  onClose: () => void;
}

export function ReviewDraftReader({
  target,
  title,
  draft: initial,
  onClose,
}: ReviewDraftReaderProps) {
  const [draft, setDraft] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const posted = draft.comments.filter(isPosted);

  function close() {
    void korev().ai.saveReviewDraft(target, draft);
    onClose();
  }

  function updateComment(next: ReviewComment) {
    setDraft((current) => ({
      ...current,
      comments: current.comments.map((comment) =>
        comment.id === next.id ? next : comment,
      ),
    }));
  }

  async function submit(event: ReviewEvent) {
    setSending(true);
    const result = await korev().ai.submitReview(target, {
      summary: draft.summary,
      event,
      comments: posted.map(({ path, line, body }) => ({ path, line, body })),
    });
    setSending(false);
    if (!result.ok) {
      setProblem(result.message);
      return;
    }
    announce(`Submitted review on #${target.number}`);
    onClose();
  }

  return (
    <Dialog
      open
      onClose={close}
      width={READER_WIDTH}
      title={`Review #${target.number} · ${title}`}
      footer={
        <>
          <span className="mr-auto self-center text-xs text-fg-3">
            {posted.length} of {pluralize(draft.comments.length, 'comment')}
          </span>
          <Button
            disabled={sending}
            onClick={() => void submit('REQUEST_CHANGES')}
          >
            Request changes
          </Button>
          <Button
            variant="primary"
            disabled={sending}
            onClick={() => void submit('COMMENT')}
          >
            Submit as comment
          </Button>
        </>
      }
    >
      <div className="flex max-h-[68vh] flex-col gap-3 overflow-y-auto">
        {draft.comments.length === 0 ? (
          <p className="m-0 type-h3 text-fg-1">Nothing to flag.</p>
        ) : null}
        <Field label="Summary">
          <textarea
            className={TEXTAREA_CLASS}
            value={draft.summary}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                summary: event.target.value,
              }))
            }
          />
        </Field>
        {draft.comments.map((comment) => (
          <CommentCard
            key={comment.id}
            comment={comment}
            onChange={updateComment}
          />
        ))}
        {problem ? (
          <p className="m-0 text-sm text-danger-text">{problem}</p>
        ) : null}
      </div>
    </Dialog>
  );
}
