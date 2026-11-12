import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  Badge,
  Button,
  cn,
  ErrorState,
  Icon,
  IconButton,
  Input,
  type IconName,
  LOADING_ICON,
  Select,
  Skeleton,
  SkeletonStatus,
  Tabs,
} from '../design-system';
import { timeAgo } from '../shared/format';
import {
  EMPTY_INBOX_FILTER,
  filterInbox,
  INBOX_STATUS_LABELS,
  INBOX_VIEWS,
  primaryStatus,
  stackRows,
  type AppState,
  type InboxFilter,
  type InboxPullRequest,
  type InboxRow,
  type InboxViewId,
  type Result,
} from '../shared/model';
import { reviewChatOf, workspaceOfPr } from '../shared/workspaces';
import {
  checkOutPullRequest,
  explainPullRequest,
  openAsk,
  reviewInboxPullRequest,
  selectWorkspace,
} from './actions';
import { api } from './bridge';
import { DRAG_REGION, NO_DRAG, TRAFFIC_LIGHT_GUTTER } from './layout';
import { Menu } from './ui/Menu';
import { setUi, useUi } from './ui-store';

const REFRESH_MS = 120_000;
const ALL_VIEW = INBOX_VIEWS[0];
const ALL_REPOS = '';
const NO_MATCH = 'No pull requests match these filters.';
const INBOX_FAILED = "Couldn't load pull requests";
const REFRESH_FAILED = "Couldn't refresh";
const INBOX_CACHE_KEY = 'korev:pr-inbox';

function readCachedInbox(): Result<InboxPullRequest[]> | null {
  try {
    const cached: unknown = JSON.parse(
      localStorage.getItem(INBOX_CACHE_KEY) ?? 'null',
    );
    return Array.isArray(cached)
      ? { ok: true, value: cached as InboxPullRequest[] }
      : null;
  } catch {
    return null;
  }
}

function cacheInbox(prs: InboxPullRequest[]) {
  localStorage.setItem(INBOX_CACHE_KEY, JSON.stringify(prs));
}

function useInbox() {
  const [inbox, setInbox] = useState(readCachedInbox);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    const loaded = await api.pullRequestInbox();
    setRefreshing(false);
    if (loaded.ok) cacheInbox(loaded.value);
    setRefreshError(loaded.ok ? null : loaded.message);
    setInbox((shown) => (!loaded.ok && shown?.ok ? shown : loaded));
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);
  return { inbox, refresh, refreshing, refreshError };
}

const ROW_GRID =
  'grid grid-cols-[minmax(0,1fr)_220px_72px_112px] items-center gap-4 px-6';
const STACK_INDENT_PX = 18;
const ROW_ACTION =
  'enabled:hover:border-border-2 enabled:hover:bg-raised enabled:hover:shadow-1';

const REVIEW_ICONS: Partial<
  Record<
    NonNullable<InboxPullRequest['reviewDecision']>,
    { icon: IconName; label: string; className: string }
  >
> = {
  APPROVED: {
    icon: 'circle-check',
    label: 'Approved',
    className: 'text-success-text',
  },
  CHANGES_REQUESTED: {
    icon: 'circle-alert',
    label: 'Changes requested',
    className: 'text-warning-text',
  },
  REVIEW_REQUIRED: {
    icon: 'eye',
    label: 'Review required',
    className: 'text-fg-4',
  },
};

function ReviewIcon({ pr }: { pr: InboxPullRequest }) {
  const review = pr.reviewDecision ? REVIEW_ICONS[pr.reviewDecision] : null;
  return (
    <span className="flex size-4 flex-none items-center justify-center">
      {review ? (
        <span role="img" aria-label={review.label} title={review.label}>
          <Icon name={review.icon} size={14} className={review.className} />
        </span>
      ) : null}
    </span>
  );
}

function UnresolvedThreads({ count }: { count: number }) {
  if (!(count > 0)) return null;
  const label = `${count} unresolved ${count === 1 ? 'thread' : 'threads'}`;
  return (
    <span role="img" aria-label={label} title={label}>
      <Badge outline>
        <Icon name="message-square" size={11} />
        {count}
      </Badge>
    </span>
  );
}

function StatusCell({ pr }: { pr: InboxPullRequest }) {
  const status = primaryStatus(pr);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <ReviewIcon pr={pr} />
      <Badge tone={status.tone} dot>
        {status.label}
      </Badge>
      <UnresolvedThreads count={pr.unresolvedThreads} />
    </div>
  );
}

function rowDetails(pr: InboxPullRequest, repoName: string | undefined) {
  return [
    `${repoName ?? ''}#${pr.number}`,
    `@${pr.author}`,
    pr.createdAt ? `opened ${timeAgo(pr.createdAt)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function RowActions({ state, pr }: { state: AppState; pr: InboxPullRequest }) {
  const review = reviewChatOf(state, pr.url);
  const workspace = workspaceOfPr(state, pr.url);
  return (
    <div className="flex items-center justify-end gap-0.5">
      <IconButton
        size="sm"
        className={ROW_ACTION}
        icon={review ? 'message-square-text' : 'sparkles'}
        label={review ? 'Open review' : 'Review'}
        title={
          review
            ? 'Open the review chat for this pull request'
            : 'Start a chat that reviews this pull request'
        }
        onClick={() =>
          review ? openAsk(review.id) : reviewInboxPullRequest(pr)
        }
      />
      <IconButton
        size="sm"
        className={ROW_ACTION}
        icon="book-open"
        label="Explain"
        title="Open an explainer that walks through what this pull request changes"
        onClick={() => explainPullRequest(pr.repoId, pr.number)}
      />
      <IconButton
        size="sm"
        className={ROW_ACTION}
        icon={workspace ? 'folder-open' : 'git-branch'}
        label={workspace ? 'Open workspace' : 'Check out'}
        title={
          workspace
            ? 'Open the workspace that has this pull request'
            : "Create a workspace on this pull request's branch"
        }
        onClick={() =>
          workspace ? selectWorkspace(workspace.id) : checkOutPullRequest(pr)
        }
      />
      <IconButton
        size="sm"
        className={ROW_ACTION}
        icon="external-link"
        label="Open on GitHub"
        title="Open this pull request on GitHub"
        onClick={() => api.openExternal(pr.url)}
      />
    </div>
  );
}

function PullRequestRow({
  state,
  row: { pr, depth, stackSize },
}: {
  state: AppState;
  row: InboxRow;
}) {
  const repo = state.repos.find((entry) => entry.id === pr.repoId);
  return (
    <li
      aria-label={`#${pr.number} ${pr.title}`}
      className={cn(
        ROW_GRID,
        'border-b border-border-1 py-2 last:border-b-0 hover:bg-hover',
      )}
    >
      <div
        className="flex min-w-0 flex-col gap-1"
        style={{ paddingLeft: depth * STACK_INDENT_PX }}
      >
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-fg-1">
          {pr.isDraft ? (
            <Icon
              name="git-pull-request-draft"
              size={13}
              className="flex-none text-fg-4"
            />
          ) : null}
          <span className="truncate">{pr.title}</span>
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-fg-4">
          {stackSize ? (
            <Badge tone="accent">
              <Icon name="layers" size={11} />
              Stack of {stackSize}
            </Badge>
          ) : null}
          <span className="truncate">{rowDetails(pr, repo?.name)}</span>
        </span>
      </div>
      <StatusCell pr={pr} />
      <span className="text-xs text-fg-3">{timeAgo(pr.updatedAt)}</span>
      <RowActions state={state} pr={pr} />
    </li>
  );
}

function updateFilter(change: Partial<InboxFilter>) {
  setUi((ui) => ({ prFilter: { ...ui.prFilter, ...change } }));
}

function toggleStatus(label: string) {
  setUi(({ prFilter }) => ({
    prFilter: {
      ...prFilter,
      statuses: prFilter.statuses.includes(label)
        ? prFilter.statuses.filter((status) => status !== label)
        : [...prFilter.statuses, label],
    },
  }));
}

function clearFilters() {
  setUi({ prFilter: EMPTY_INBOX_FILTER, prView: ALL_VIEW.id });
}

function isFiltering(filter: InboxFilter) {
  return Boolean(
    filter.query.trim() || filter.repoId || filter.statuses.length,
  );
}

function viewOf(id: InboxViewId) {
  return INBOX_VIEWS.find((view) => view.id === id) ?? ALL_VIEW;
}

function useMatchingInbox(
  state: AppState,
  inbox: Result<InboxPullRequest[]> | null,
): InboxPullRequest[] {
  const filter = useUi((ui) => ui.prFilter);
  const repoNames = useMemo(
    () => new Map(state.repos.map((repo) => [repo.id, repo.name])),
    [state.repos],
  );
  return useMemo(
    () => (inbox?.ok ? filterInbox(inbox.value, filter, repoNames) : []),
    [inbox, filter, repoNames],
  );
}

function useFocusOnFind(input: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    function focus(event: KeyboardEvent) {
      if (!event.metaKey || event.key !== 'f') return;
      event.preventDefault();
      input.current?.focus();
    }
    window.addEventListener('keydown', focus);
    return () => window.removeEventListener('keydown', focus);
  }, [input]);
}

function RepoSelect({
  state,
  prs,
}: {
  state: AppState;
  prs: InboxPullRequest[];
}) {
  const repoId = useUi((ui) => ui.prFilter.repoId);
  const repos = state.repos.filter((repo) =>
    prs.some((pr) => pr.repoId === repo.id),
  );
  if (repos.length < 2) return null;
  return (
    <Select
      ariaLabel="Repository"
      icon="folder-git-2"
      value={repoId ?? ALL_REPOS}
      onChange={(value) => updateFilter({ repoId: value || null })}
      options={[
        { value: ALL_REPOS, label: 'All repositories' },
        ...repos.map((repo) => ({ value: repo.id, label: repo.name })),
      ]}
    />
  );
}

function FiltersMenu() {
  const statuses = useUi((ui) => ui.prFilter.statuses);
  return (
    <Menu
      label="Filters"
      items={INBOX_STATUS_LABELS.map((label) => ({
        id: label,
        label,
        checked: statuses.includes(label),
        keepOpen: true,
        onSelect: () => toggleStatus(label),
      }))}
      trigger={({ open, toggle }) => (
        <Button
          size="sm"
          variant={statuses.length ? 'secondary' : 'ghost'}
          icon="list-filter"
          aria-expanded={open}
          onClick={toggle}
        >
          Filters
          {statuses.length ? <Badge count>{statuses.length}</Badge> : null}
        </Button>
      )}
    />
  );
}

function Toolbar({
  state,
  prs,
  matching,
}: {
  state: AppState;
  prs: InboxPullRequest[];
  matching: InboxPullRequest[];
}) {
  const query = useUi((ui) => ui.prFilter.query);
  const view = useUi((ui) => ui.prView);
  const search = useRef<HTMLInputElement>(null);
  useFocusOnFind(search);
  return (
    <div className="flex flex-none flex-wrap items-center gap-2 px-6 pt-5 pb-3">
      <Tabs
        variant="pill"
        value={view}
        onChange={(id) => setUi({ prView: viewOf(id as InboxViewId).id })}
        tabs={INBOX_VIEWS.map((entry) => ({
          id: entry.id,
          label: entry.label,
          count: matching.filter(entry.matches).length,
        }))}
      />
      <FiltersMenu />
      <div className="flex-1" />
      <RepoSelect state={state} prs={prs} />
      <Input
        ref={search}
        aria-label="Filter"
        icon="search"
        autoFocus
        className="w-64"
        placeholder="Search title, repo or #number"
        value={query}
        onChange={(event) => updateFilter({ query: event.target.value })}
        onKeyDown={(event) => {
          if (event.key === 'Escape') updateFilter({ query: '' });
        }}
      />
    </div>
  );
}

function NoMatch() {
  return (
    <div className="flex flex-col items-start gap-2 px-6 py-6">
      <p className="m-0 text-sm text-fg-3">{NO_MATCH}</p>
      <Button size="sm" variant="secondary" onClick={clearFilters}>
        Clear filters
      </Button>
    </div>
  );
}

function ColumnHeaders() {
  return (
    <div
      aria-hidden="true"
      className={cn(
        ROW_GRID,
        'sticky top-0 z-10 h-8 border-b border-border-1 bg-app type-overline text-fg-4',
      )}
    >
      <span>Title</span>
      <span>Status</span>
      <span>Updated</span>
      <span />
    </div>
  );
}

const SKELETON_ROWS = 6;

function InboxSkeleton() {
  return (
    <SkeletonStatus className="gap-0">
      {Array.from({ length: SKELETON_ROWS }, (_, row) => (
        <div
          key={row}
          className={cn(ROW_GRID, 'border-b border-border-1 py-3')}
        >
          <div className="flex min-w-0 flex-col gap-1.5">
            <Skeleton className={row % 2 ? 'w-1/2' : 'w-2/3'} />
            <Skeleton className="h-2.5 w-1/3 opacity-60" />
          </div>
          <Skeleton className="h-5 w-20 rounded-xs" />
          <Skeleton className="h-2.5 w-10 opacity-60" />
          <span />
        </div>
      ))}
    </SkeletonStatus>
  );
}

function InboxTable({
  state,
  inbox,
  matching,
  onRetry,
}: {
  state: AppState;
  inbox: Result<InboxPullRequest[]> | null;
  matching: InboxPullRequest[];
  onRetry: () => Promise<void>;
}) {
  const filter = useUi((ui) => ui.prFilter);
  const view = viewOf(useUi((ui) => ui.prView));
  const rows = useMemo(
    () => stackRows(matching.filter(view.matches)),
    [matching, view],
  );
  if (!inbox) return <InboxSkeleton />;
  if (!inbox.ok)
    return (
      <ErrorState
        title={INBOX_FAILED}
        detail={inbox.message}
        onRetry={onRetry}
        className="pt-[12vh]"
      />
    );
  if (!rows.length)
    return isFiltering(filter) ? (
      <NoMatch />
    ) : (
      <p className="m-0 px-6 py-6 text-sm text-fg-3">{view.empty}</p>
    );
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {rows.map((row) => (
        <PullRequestRow key={row.pr.url} state={state} row={row} />
      ))}
    </ul>
  );
}

export function PullRequestsPage({ state }: { state: AppState }) {
  const sidebar = useUi((ui) => ui.sidebar);
  const { inbox, refresh, refreshing, refreshError } = useInbox();
  const matching = useMatchingInbox(state, inbox);
  const staleAfterError = Boolean(refreshError && inbox?.ok);
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div
        className={cn(
          'flex h-11 flex-none items-center justify-between border-b border-border-1 pr-2',
          DRAG_REGION,
          sidebar ? 'pl-6' : TRAFFIC_LIGHT_GUTTER,
        )}
      >
        <div className="flex items-baseline gap-2">
          <h1 className="m-0 text-sm font-semibold text-fg-1">Pull requests</h1>
          {staleAfterError ? (
            <span
              className="text-xs text-fg-4"
              title={refreshError ?? undefined}
            >
              {REFRESH_FAILED}
            </span>
          ) : null}
        </div>
        <IconButton
          icon={refreshing ? LOADING_ICON : 'refresh-cw'}
          label="Refresh"
          size="sm"
          className={NO_DRAG}
          disabled={refreshing}
          aria-busy={refreshing || undefined}
          onClick={refresh}
        />
      </div>
      {inbox?.ok ? (
        <Toolbar state={state} prs={inbox.value} matching={matching} />
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {inbox?.ok ? <ColumnHeaders /> : null}
        <InboxTable
          state={state}
          inbox={inbox}
          matching={matching}
          onRetry={refresh}
        />
      </div>
    </div>
  );
}
