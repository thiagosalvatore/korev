import { useEffect, useState } from 'react';
import {
  Button,
  cn,
  DiffStat,
  FileRow,
  Icon,
  Spinner,
} from '../../design-system';
import {
  primaryPr,
  type AppState,
  type FileChange,
  type ReviewComment,
  type TurnRange,
  type Workspace,
} from '../../shared/model';
import { api } from '../bridge';
import { usePolling } from '../hooks';
import { EMPTY_WORKSPACE_UI, setUi, useUi, type DiffLayout } from '../ui-store';
import { FileDiff } from './FileDiff';

const REFRESH_MS = 4_000;
const LAYOUTS: { id: DiffLayout; label: string }[] = [
  { id: 'unified', label: 'Unified' },
  { id: 'split', label: 'Split' },
];

export interface DiffViewProps {
  state: AppState;
  workspace: Workspace;
  focusFile: string | null;
  range: TurnRange | null;
  onSendComments: () => void;
}

function scrollToFile(path: string) {
  document.getElementById(`diff-${path}`)?.scrollIntoView({ block: 'start' });
}

function useChanges(workspace: Workspace, range: TurnRange | null) {
  const [changes, setChanges] = useState<FileChange[] | null>(null);
  usePolling(
    () => {
      if (workspace.archivedAt) return;
      const load = range
        ? api.rangeChanges(workspace.id, range)
        : api.changes(workspace.id);
      void load.then(setChanges);
    },
    range ? Number.MAX_SAFE_INTEGER : REFRESH_MS,
    [workspace.id, range?.to],
  );
  return changes;
}

function useReviewComments(state: AppState, workspace: Workspace) {
  const prUrl = useUi((ui) => ui.workspaces[workspace.id]?.prUrl);
  const pr = primaryPr(workspace, state.runtime[workspace.id], prUrl);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  useEffect(() => {
    if (pr?.state !== 'OPEN') return;
    void api.reviewComments(workspace.id, pr.number).then(setComments);
  }, [workspace.id, pr?.number, pr?.state]);
  return comments;
}

export function DiffView({
  state,
  workspace,
  focusFile,
  range,
  onSendComments,
}: DiffViewProps) {
  const changes = useChanges(workspace, range);
  const ui = useUi(
    (value) => value.workspaces[workspace.id] ?? EMPTY_WORKSPACE_UI,
  );
  const layout = useUi((value) => value.diffLayout);
  const reviewComments = useReviewComments(state, workspace);
  const viewedCount = (changes ?? []).filter(
    (change) => ui.viewed?.[change.path],
  ).length;

  useEffect(() => {
    if (focusFile && changes) scrollToFile(focusFile);
  }, [focusFile, changes]);

  if (!changes) return <Spinner />;
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
          <span>
            {range
              ? 'Changes in this turn'
              : `${changes.length} files · ${viewedCount} viewed`}
          </span>
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
              reviewed={Boolean(ui.viewed?.[change.path])}
              onClick={() => scrollToFile(change.path)}
            />
          ))}
        </div>
        {ui.comments.length ? (
          <div className="border-t border-border-1 p-2">
            <Button
              size="sm"
              variant="primary"
              icon="send"
              className="w-full"
              onClick={onSendComments}
            >
              {ui.comments.length} comment{ui.comments.length === 1 ? '' : 's'}{' '}
              ready to send
            </Button>
          </div>
        ) : null}
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex h-9 flex-none items-center gap-1 border-b border-border-1 px-3">
          {LAYOUTS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={layout === entry.id}
              className={cn(
                'h-6 cursor-pointer rounded-sm border-0 bg-transparent px-2 text-xs text-fg-3 hover:text-fg-1',
                layout === entry.id && 'bg-active text-fg-1',
              )}
              onClick={() => setUi({ diffLayout: entry.id })}
            >
              {entry.label}
            </button>
          ))}
          {reviewComments.length ? (
            <span className="ml-2 flex items-center gap-1 text-xs text-fg-3">
              <Icon name="git-pull-request" size={12} />
              {reviewComments.length} review comment
              {reviewComments.length === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {changes.map((change) => (
            <FileDiff
              key={`${change.path}:${range?.to ?? 'live'}`}
              workspace={workspace}
              change={change}
              range={range}
              layout={layout}
              comments={ui.comments}
              reviewComments={reviewComments.filter(
                (comment) => comment.path === change.path,
              )}
              viewedSignature={ui.viewed?.[change.path] ?? null}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
