import { useEffect, useRef, useState } from 'react';
import {
  Button,
  DiffHunk,
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

export interface ReviewDraftEditorProps {
  target: PrTarget;
  draft: ReviewDraft;
}

function useSaveOnLeave(target: PrTarget, draft: ReviewDraft) {
  const latest = useRef({ target, draft, submitted: false });
  useEffect(() => {
    latest.current = { ...latest.current, target, draft };
  });
  useEffect(
    () => () => {
      const { target: leaving, draft: edited, submitted } = latest.current;
      if (!submitted) void korev().ai.saveReviewDraft(leaving, edited);
    },
    [],
  );
  return (submitted: boolean) => {
    latest.current.submitted = submitted;
  };
}

export function ReviewDraftEditor({
  target,
  draft: initial,
}: ReviewDraftEditorProps) {
  const [draft, setDraft] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const setSubmitted = useSaveOnLeave(target, draft);
  const posted = draft.comments.filter(isPosted);

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
    setSubmitted(true);
    const result = await korev().ai.submitReview(target, {
      summary: draft.summary,
      event,
      comments: posted.map(({ path, line, body }) => ({ path, line, body })),
    });
    setSending(false);
    if (!result.ok) {
      setSubmitted(false);
      setProblem(result.message);
      return;
    }
    announce(`Submitted review on #${target.number}`);
  }

  return (
    <section aria-label="Review draft" className="flex flex-col gap-3">
      <h3 className="m-0 type-overline text-fg-3">Review draft</h3>
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
      <div className="flex items-center gap-2 border-t border-border-1 pt-3">
        <span className="mr-auto text-xs text-fg-3">
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
      </div>
    </section>
  );
}
