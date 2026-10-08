import { useState } from 'react';
import { Badge, Button, cn, Icon, Spinner, Tabs } from '../../design-system';
import { fileName } from '../../shared/format';
import {
  primaryPr,
  type AppState,
  type PrStatus,
  type PrThread,
  type Workspace,
} from '../../shared/model';
import { addThreadToChat, openDiff, openFile } from '../actions';
import { api } from '../bridge';
import { Markdown } from '../chat/Markdown';
import { usePolling } from '../hooks';
import { useUi } from '../ui-store';

const PR_REFRESH_MS = 30_000;
const HUNK_CONTEXT_LINES = 4;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const LAYOUT_TAGS =
  /<\/?(?:details|summary|div|p|br|hr|sub|sup|b|i|em|strong|blockquote|picture|source|img|a|span|table|thead|tbody|tr|td|th|ul|ol|li|h[1-6])\b[^<>]*>/gi;

type Side = 'humans' | 'bots';

const SIDE_LABELS: Record<Side, string> = { humans: 'Humans', bots: 'Bots' };

export function readableBody(body: string): string {
  return body.replace(HTML_COMMENT, '').replace(LAYOUT_TAGS, '');
}

function sideOf(thread: PrThread): Side {
  return thread.comments[0]?.isBot ? 'bots' : 'humans';
}

function threadLocation(thread: PrThread): string {
  if (!thread.path) return 'Conversation';
  const line = thread.line ? `:${thread.line}` : '';
  return `${fileName(thread.path)}${line}`;
}

function hunkTail(diffHunk: string): string {
  return diffHunk.split('\n').slice(-HUNK_CONTEXT_LINES).join('\n');
}

export function usePrThreads(
  state: AppState,
  workspace: Workspace,
): { pr: PrStatus | null; threads: PrThread[] | null } {
  const prUrl = useUi((ui) => ui.workspaces[workspace.id]?.prUrl);
  const primary = primaryPr(workspace, state.runtime[workspace.id], prUrl);
  const pr = primary?.state === 'OPEN' ? primary : null;
  const [threads, setThreads] = useState<PrThread[] | null>(null);
  usePolling(
    () => {
      if (pr) void api.prThreads(workspace.id, pr.url).then(setThreads);
    },
    PR_REFRESH_MS,
    [workspace.id, pr?.url],
  );
  return { pr, threads: pr ? threads : null };
}

function ThreadCard({
  workspace,
  thread,
}: {
  workspace: Workspace;
  thread: PrThread;
}) {
  const [first] = thread.comments;
  const replies = thread.comments.length - 1;
  return (
    <details
      open={!thread.isResolved}
      className="group mb-2 rounded-md border border-border-1 bg-surface text-xs"
    >
      <summary className="flex cursor-pointer items-center gap-1.5 px-2 py-1.5 text-fg-3">
        <Icon
          name="chevron-right"
          size={12}
          className="flex-none transition-transform group-open:rotate-90"
        />
        <span className="min-w-0 truncate font-mono" title={thread.path ?? ''}>
          {threadLocation(thread)}
        </span>
        <span className="flex-none font-medium text-fg-2">
          @{first?.author}
        </span>
        {replies ? (
          <span className="flex-none">
            {replies} {replies === 1 ? 'reply' : 'replies'}
          </span>
        ) : null}
        <span className="flex-1" />
        {thread.isOutdated ? <Badge tone="warning">Outdated</Badge> : null}
        {thread.isResolved ? <Badge tone="success">Resolved</Badge> : null}
      </summary>
      <div className="flex flex-col gap-2 border-t border-border-1 p-2">
        {thread.diffHunk ? (
          <pre className="m-0 overflow-x-auto rounded-sm bg-inset p-1.5 font-mono text-fg-3">
            {hunkTail(thread.diffHunk)}
          </pre>
        ) : null}
        {thread.comments.map((comment) => (
          <div key={comment.id} className="min-w-0">
            <div className="mb-0.5 font-medium text-fg-1">
              @{comment.author}
            </div>
            <Markdown
              text={readableBody(comment.body)}
              onOpenFile={(file, line) =>
                openFile(workspace.id, file, { line })
              }
            />
          </div>
        ))}
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            icon="message-square-plus"
            onClick={() => addThreadToChat(workspace.id, thread)}
          >
            Add to chat
          </Button>
          {thread.path ? (
            <Button
              size="sm"
              variant="ghost"
              icon="git-compare"
              onClick={() => openDiff(workspace.id, thread.path)}
            >
              Diff
            </Button>
          ) : null}
          {first ? (
            <Button
              size="sm"
              variant="ghost"
              icon="external-link"
              onClick={() => void api.openExternal(first.url)}
            >
              Open on GitHub
            </Button>
          ) : null}
        </div>
      </div>
    </details>
  );
}

export function PrComments({
  state,
  workspace,
  wide = false,
  onOpenTab,
}: {
  state: AppState;
  workspace: Workspace;
  wide?: boolean;
  onOpenTab?: () => void;
}) {
  const { pr, threads } = usePrThreads(state, workspace);
  const [side, setSide] = useState<Side>('humans');
  if (!pr) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-6 text-center text-fg-3">
        <Icon name="message-square" size={20} />
        <p className="m-0 text-sm">No open pull request</p>
      </div>
    );
  }
  if (!threads) return <Spinner />;
  const shown = threads.filter((thread) => sideOf(thread) === side);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={cn(
          'flex h-9 w-full flex-none items-center gap-2 px-3',
          wide && 'mx-auto mt-3 max-w-3xl',
        )}
      >
        <Tabs
          variant="pill"
          tabs={(['humans', 'bots'] as const).map((id) => ({
            id,
            label: SIDE_LABELS[id],
            count: threads.filter((thread) => sideOf(thread) === id).length,
          }))}
          value={side}
          onChange={(id) => setSide(id as Side)}
        />
        <span className="flex-1" />
        {onOpenTab ? (
          <Button
            size="sm"
            variant="ghost"
            icon="square-arrow-out-up-right"
            onClick={onOpenTab}
          >
            Open as tab
          </Button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={cn('px-3 pb-3', wide && 'mx-auto max-w-3xl')}>
          {shown.length ? (
            shown.map((thread) => (
              <ThreadCard
                key={thread.id}
                workspace={workspace}
                thread={thread}
              />
            ))
          ) : (
            <p className="m-0 py-6 text-center text-xs text-fg-3">
              No comments from {SIDE_LABELS[side].toLowerCase()}.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
