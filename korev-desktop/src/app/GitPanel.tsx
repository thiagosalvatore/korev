import { useMemo, useState } from 'react';
import {
  Button,
  cn,
  DiffStat,
  FileRow,
  Icon,
  Spinner,
  Tabs,
  type IconName,
} from '../design-system';
import {
  mergeStep,
  PR_STEPS,
  stackBlocked,
  type AppState,
  type CheckState,
  type FileChange,
  type GitWorktree,
  type PrStatus,
  type ReviewDecision,
  type Workspace,
} from '../shared/model';
import {
  createPr,
  fixErrors,
  mergePr,
  openPrAsWorkspace,
  activateTab,
  openComments,
  openDiff,
  openFile,
  resolveConflicts,
} from './actions';
import { api } from './bridge';
import { fileName } from '../shared/format';
import { usePolling } from './hooks';
import { reportFailure } from './ui/toast';
import { PrComments } from './comments/PrComments';
import { setUi, useUi, type GitPanelTab } from './ui-store';

const CHANGES_REFRESH_MS = 4_000;

const CHECK_ICONS: Record<CheckState, { icon: IconName; className: string }> = {
  success: { icon: 'circle-check', className: 'text-success-text' },
  failure: { icon: 'circle-x', className: 'text-danger-text' },
  pending: {
    icon: 'loader-circle',
    className: 'animate-spin text-warning-text',
  },
  skipped: { icon: 'circle-slash', className: 'text-fg-4' },
};

const REVIEW_PILLS: Record<
  ReviewDecision,
  { label: string; className: string }
> = {
  APPROVED: {
    label: 'Approved',
    className: 'bg-success-subtle text-success-text',
  },
  CHANGES_REQUESTED: {
    label: 'Changes requested',
    className: 'bg-danger-subtle text-danger-text',
  },
  REVIEW_REQUIRED: {
    label: 'Review required',
    className: 'bg-warning-subtle text-warning-text',
  },
};

interface TreeNode {
  name: string;
  path: string;
  children: Map<string, TreeNode>;
  isFile: boolean;
}

function buildTree(files: string[]): TreeNode {
  const root: TreeNode = {
    name: '',
    path: '',
    children: new Map(),
    isFile: false,
  };
  for (const file of files) {
    let node = root;
    const parts = file.split('/');
    parts.forEach((part, index) => {
      const path = parts.slice(0, index + 1).join('/');
      let child = node.children.get(part);
      if (!child) {
        child = {
          name: part,
          path,
          children: new Map(),
          isFile: index === parts.length - 1,
        };
        node.children.set(part, child);
      }
      node = child;
    });
  }
  return root;
}

function sortedChildren(node: TreeNode): TreeNode[] {
  return [...node.children.values()].sort(
    (a, b) =>
      Number(a.isFile) - Number(b.isFile) || a.name.localeCompare(b.name),
  );
}

function TreeItem({
  node,
  depth,
  workspace,
}: {
  node: TreeNode;
  depth: number;
  workspace: Workspace;
}) {
  const [open, setOpen] = useState(false);
  const indent = { paddingLeft: 8 + depth * 12 };
  if (node.isFile) {
    return (
      <button
        type="button"
        className="flex h-6 w-full cursor-pointer items-center gap-1.5 truncate rounded-sm border-0 bg-transparent pr-2 text-left text-xs text-fg-2 hover:bg-hover hover:text-fg-1"
        style={indent}
        title={node.path}
        onClick={() => openFile(workspace.id, node.path)}
      >
        <Icon name="file" size={12} className="flex-none text-fg-4" />
        <span className="truncate">{node.name}</span>
      </button>
    );
  }
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        className="flex h-6 w-full cursor-pointer items-center gap-1.5 rounded-sm border-0 bg-transparent pr-2 text-left text-xs text-fg-2 hover:bg-hover"
        style={indent}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon
          name={open ? 'folder-open' : 'folder'}
          size={12}
          className="flex-none text-fg-3"
        />
        <span className="truncate">{node.name}</span>
      </button>
      {open
        ? sortedChildren(node).map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              workspace={workspace}
            />
          ))
        : null}
    </div>
  );
}

function AllFiles({ workspace }: { workspace: Workspace }) {
  const [files, setFiles] = useState<string[] | null>(null);
  const [filter, setFilter] = useState('');
  usePolling(
    () =>
      void api
        .listFiles(workspace.id)
        .then(setFiles)
        .catch(() => setFiles([])),
    15_000,
    [workspace.id],
  );
  const tree = useMemo(() => buildTree(files ?? []), [files]);
  const matches = filter
    ? (files ?? [])
        .filter((file) => file.toLowerCase().includes(filter.toLowerCase()))
        .slice(0, 200)
    : null;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="p-2">
        <input
          aria-label="Filter files"
          value={filter}
          placeholder="Filter files"
          className="h-7 w-full rounded-sm border border-border-2 bg-inset px-2 text-xs text-fg-1 outline-none focus:border-accent-border"
          onChange={(event) => setFilter(event.target.value)}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
        {matches
          ? matches.map((file) => (
              <button
                key={file}
                type="button"
                title={file}
                className="flex h-6 w-full cursor-pointer items-center gap-1.5 truncate rounded-sm border-0 bg-transparent px-2 text-left text-xs text-fg-2 hover:bg-hover"
                onClick={() => openFile(workspace.id, file)}
              >
                <Icon name="file" size={12} className="flex-none text-fg-4" />
                <span className="truncate">{fileName(file)}</span>
                <span className="truncate text-fg-4">{file}</span>
              </button>
            ))
          : sortedChildren(tree).map((node) => (
              <TreeItem
                key={node.path}
                node={node}
                depth={0}
                workspace={workspace}
              />
            ))}
      </div>
    </div>
  );
}

function Changes({
  workspace,
  changes,
}: {
  workspace: Workspace;
  changes: FileChange[] | null;
}) {
  if (!changes) return <Spinner />;
  const additions = changes.reduce((sum, change) => sum + change.additions, 0);
  const deletions = changes.reduce((sum, change) => sum + change.deletions, 0);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 flex-none items-center gap-2 px-3">
        <span className="text-xs text-fg-3">{changes.length} changed</span>
        <DiffStat additions={additions} deletions={deletions} showBar={false} />
        <div className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          icon="scan-search"
          disabled={!changes.length}
          onClick={async () => {
            const started = await api.startReview(workspace.id);
            if (reportFailure(started))
              activateTab(workspace.id, `chat:${started.value}`);
          }}
        >
          Review
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon="git-compare"
          disabled={!changes.length}
          onClick={() => openDiff(workspace.id)}
        >
          Diff
        </Button>
      </div>
      {changes.length ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
          {changes.map((change) => (
            <FileRow
              key={change.path}
              path={change.path}
              status={change.status}
              additions={change.additions}
              deletions={change.deletions}
              onClick={() => openDiff(workspace.id, change.path)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-6 text-center text-fg-3">
          <Icon name="git-compare" size={20} />
          <p className="m-0 text-sm">No changes yet</p>
          <p className="m-0 text-xs text-fg-4">
            Changes compared to origin/{workspace.baseBranch} show up here.
          </p>
        </div>
      )}
    </div>
  );
}

function PrCard({
  workspace,
  pr,
  worktree,
}: {
  workspace: Workspace;
  pr: PrStatus;
  worktree: GitWorktree | null;
}) {
  const failing = pr.checks.filter((check) => check.state === 'failure').length;
  const pending = pr.checks.filter((check) => check.state === 'pending').length;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border-1 bg-surface p-3">
      <button
        type="button"
        className="flex cursor-pointer items-start gap-2 border-0 bg-transparent p-0 text-left"
        onClick={() => void api.openExternal(pr.url)}
      >
        <Icon name="git-pull-request" size={14} className="mt-0.5 text-fg-3" />
        <span className="min-w-0 flex-1 text-sm font-medium text-fg-1">
          {pr.title} <span className="text-fg-3">#{pr.number}</span>
        </span>
        <Icon name="external-link" size={12} className="mt-1 text-fg-4" />
      </button>
      <div className="flex flex-wrap gap-1.5 text-xs">
        <span className="rounded-sm bg-active px-1.5 py-0.5 text-fg-2">
          {pr.isDraft ? 'Draft' : pr.state.toLowerCase()}
        </span>
        {pr.mergeable === 'CONFLICTING' ? (
          <span className="rounded-sm bg-warning-subtle px-1.5 py-0.5 text-warning-text">
            Merge conflicts
          </span>
        ) : null}
        {failing ? (
          <span className="rounded-sm bg-danger-subtle px-1.5 py-0.5 text-danger-text">
            {failing} failing
          </span>
        ) : null}
        {pending ? (
          <span className="rounded-sm bg-warning-subtle px-1.5 py-0.5 text-warning-text">
            {pending} running
          </span>
        ) : null}
        {pr.reviewDecision ? (
          <span
            className={cn(
              'rounded-sm px-1.5 py-0.5',
              REVIEW_PILLS[pr.reviewDecision].className,
            )}
          >
            {REVIEW_PILLS[pr.reviewDecision].label}
          </span>
        ) : null}
      </div>
      {worktree ? (
        <div
          className="flex items-center gap-1.5 truncate font-mono text-xs text-fg-3"
          title={worktree.path}
        >
          <Icon name="folder-git-2" size={12} />
          {worktree.path}
        </div>
      ) : null}
      {pr.state === 'OPEN' ? (
        <div className="flex gap-1.5">
          {pr.mergeable === 'CONFLICTING' ? (
            <Button
              size="sm"
              variant="danger"
              icon="git-compare-arrows"
              onClick={() => resolveConflicts(workspace, pr)}
            >
              Resolve conflicts
            </Button>
          ) : null}
          {failing ? (
            <Button
              size="sm"
              variant="danger"
              icon="wrench"
              onClick={() => fixErrors(workspace, pr)}
            >
              Fix errors
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="success"
            icon="git-merge"
            disabled={pr.mergeable === 'CONFLICTING' || stackBlocked(pr)}
            onClick={() => mergePr(workspace, pr)}
          >
            {PR_STEPS[mergeStep(pr)].label}
          </Button>
          {pr.headRefName !== workspace.branch ? (
            <Button
              size="sm"
              variant="ghost"
              icon="square-arrow-out-up-right"
              onClick={() => openPrAsWorkspace(workspace, pr)}
            >
              Open as workspace
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Checks({
  state,
  workspace,
}: {
  state: AppState;
  workspace: Workspace;
}) {
  const prs = state.runtime[workspace.id]?.prs ?? [];
  const strays = state.runtime[workspace.id]?.strayWorktrees ?? [];
  if (!prs.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-fg-3">
        <Icon name="git-pull-request" size={20} />
        <p className="m-0 text-sm">No pull request yet</p>
        <Button
          size="sm"
          variant="primary"
          icon="git-pull-request-arrow"
          onClick={() => createPr(workspace)}
        >
          Create PR
        </Button>
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      {openFirst(prs).map((pr) => (
        <PrSection
          key={pr.url}
          workspace={workspace}
          pr={pr}
          worktree={
            strays.find((stray) => stray.branch === pr.headRefName) ?? null
          }
        />
      ))}
    </div>
  );
}

function openFirst(prs: PrStatus[]): PrStatus[] {
  return prs
    .slice()
    .sort((a, b) => Number(b.state === 'OPEN') - Number(a.state === 'OPEN'));
}

function PrSection({
  workspace,
  pr,
  worktree,
}: {
  workspace: Workspace;
  pr: PrStatus;
  worktree: GitWorktree | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      <PrCard workspace={workspace} pr={pr} worktree={worktree} />
      <div>
        <div className="mb-1 type-overline text-fg-4">Checks</div>
        {pr.checks.length ? (
          pr.checks
            .slice()
            .sort(
              (a, b) =>
                ['failure', 'pending', 'success', 'skipped'].indexOf(a.state) -
                ['failure', 'pending', 'success', 'skipped'].indexOf(b.state),
            )
            .map((check) => (
              <button
                key={`${check.name}-${check.url}`}
                type="button"
                disabled={!check.url}
                className="flex h-7 w-full cursor-pointer items-center gap-2 rounded-sm border-0 bg-transparent px-1.5 text-left text-xs text-fg-2 hover:bg-hover disabled:cursor-default"
                onClick={() => check.url && void api.openExternal(check.url)}
              >
                <Icon
                  name={CHECK_ICONS[check.state].icon}
                  size={13}
                  className={CHECK_ICONS[check.state].className}
                />
                <span className="truncate">{check.name}</span>
              </button>
            ))
        ) : (
          <p className="m-0 text-xs text-fg-3">No checks reported.</p>
        )}
      </div>
    </div>
  );
}

const TABS: { id: GitPanelTab; label: string }[] = [
  { id: 'files', label: 'All files' },
  { id: 'changes', label: 'Changes' },
  { id: 'checks', label: 'Checks' },
  { id: 'comments', label: 'Comments' },
];

export function GitPanel({
  state,
  workspace,
}: {
  state: AppState;
  workspace: Workspace;
}) {
  const tab = useUi((ui) => ui.gitTab);
  const [changes, setChanges] = useState<FileChange[] | null>(null);
  usePolling(
    () => {
      if (!workspace.archivedAt)
        void api
          .changes(workspace.id)
          .then(setChanges)
          .catch(() => setChanges([]));
    },
    CHANGES_REFRESH_MS,
    [workspace.id, workspace.archivedAt],
  );
  return (
    <section aria-label="Git" className="flex min-h-0 flex-1 flex-col">
      <Tabs
        className="flex-none px-1.5"
        tabs={TABS.map((entry) => ({
          ...entry,
          count:
            entry.id === 'changes' && changes?.length
              ? changes.length
              : undefined,
        }))}
        value={tab}
        onChange={(id) => setUi({ gitTab: id as GitPanelTab })}
      />
      <div className={cn('flex min-h-0 flex-1 flex-col')}>
        {workspace.archivedAt ? (
          <p className="m-0 p-4 text-sm text-fg-3">Archived workspace.</p>
        ) : tab === 'files' ? (
          <AllFiles workspace={workspace} />
        ) : tab === 'changes' ? (
          <Changes workspace={workspace} changes={changes} />
        ) : tab === 'checks' ? (
          <Checks state={state} workspace={workspace} />
        ) : (
          <PrComments
            state={state}
            workspace={workspace}
            onOpenTab={() => openComments(workspace.id)}
          />
        )}
      </div>
    </section>
  );
}
