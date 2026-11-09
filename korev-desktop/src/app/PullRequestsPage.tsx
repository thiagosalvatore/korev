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
  INBOX_GROUPS,
  INBOX_STATUS_LABELS,
  inboxStatuses,
  type AppState,
  type InboxFilter,
  type InboxPullRequest,
  type InboxReason,
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
import { setUi, useUi } from './ui-store';

const REFRESH_MS = 120_000;
const ALL_GROUPS = 'all';
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

function PullRequestRow({
  state,
  pr,
}: {
  state: AppState;
  pr: InboxPullRequest;
}) {
  const label = `#${pr.number} ${pr.title}`;
  const review = reviewChatOf(state, pr.url);
  const workspace = workspaceOfPr(state, pr.url);
  const repo = state.repos.find((entry) => entry.id === pr.repoId);
  return (
    <li
      aria-label={label}
      className="flex items-center gap-3 rounded-md border border-border-1 bg-surface px-3 py-2.5"
    >
      <Icon
        name={pr.isDraft ? 'git-pull-request-draft' : 'git-pull-request'}
        size={15}
        className="flex-none text-fg-3"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm text-fg-1">{label}</span>
        <span className="truncate text-xs text-fg-4">
          {[
            repo?.name,
            `@${pr.author}`,
            pr.headRefName,
            timeAgo(pr.updatedAt),
          ].join(' · ')}
        </span>
      </div>
      <div className="flex flex-none items-center gap-1">
        {inboxStatuses(pr).map((status) => (
          <Badge key={status.label} tone={status.tone}>
            {status.label}
          </Badge>
        ))}
      </div>
      <div className="flex flex-none items-center gap-1">
        <Button
          size="sm"
          variant={pr.reason === 'review-requested' ? 'primary' : 'secondary'}
          onClick={() =>
            review ? openAsk(review.id) : reviewInboxPullRequest(pr)
          }
        >
          {review ? 'Open review' : 'Review'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => explainPullRequest(pr.repoId, pr.number)}
        >
          Explain
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            workspace ? selectWorkspace(workspace.id) : checkOutPullRequest(pr)
          }
        >
          {workspace ? 'Open workspace' : 'Check out'}
        </Button>
        <IconButton
          icon="external-link"
          label="Open on GitHub"
          size="sm"
          onClick={() => api.openExternal(pr.url)}
        />
      </div>
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
  setUi({ prFilter: EMPTY_INBOX_FILTER, prReason: null });
}

function isFiltering(filter: InboxFilter, reason: InboxReason | null) {
  return Boolean(
    filter.query.trim() || filter.repoId || filter.statuses.length || reason,
  );
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

function FilterBar({
  state,
  prs,
  matching,
}: {
  state: AppState;
  prs: InboxPullRequest[];
  matching: InboxPullRequest[];
}) {
  const filter = useUi((ui) => ui.prFilter);
  const reason = useUi((ui) => ui.prReason);
  const search = useRef<HTMLInputElement>(null);
  useFocusOnFind(search);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Input
          ref={search}
          aria-label="Filter"
          icon="search"
          autoFocus
          className="flex-1"
          placeholder="Filter by number, title, author or branch"
          value={filter.query}
          onChange={(event) => updateFilter({ query: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Escape') updateFilter({ query: '' });
          }}
        />
        <RepoSelect state={state} prs={prs} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs
          variant="pill"
          value={reason ?? ALL_GROUPS}
          onChange={(id) =>
            setUi({
              prReason:
                INBOX_GROUPS.find((group) => group.reason === id)?.reason ??
                null,
            })
          }
          tabs={[
            { id: ALL_GROUPS, label: 'All', count: matching.length },
            ...INBOX_GROUPS.map((group) => ({
              id: group.reason,
              label: group.title,
              count: matching.filter((pr) => pr.reason === group.reason).length,
            })),
          ]}
        />
        <div className="flex flex-wrap items-center gap-1">
          {INBOX_STATUS_LABELS.map((label) => {
            const on = filter.statuses.includes(label);
            return (
              <Button
                key={label}
                size="sm"
                variant={on ? 'secondary' : 'ghost'}
                aria-pressed={on}
                onClick={() => toggleStatus(label)}
              >
                {label}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function NoMatch() {
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="m-0 text-sm text-fg-3">{NO_MATCH}</p>
      <Button size="sm" variant="secondary" onClick={clearFilters}>
        Clear filters
      </Button>
    </div>
  );
}

const SKELETON_ROWS = 5;

function InboxSkeleton() {
  return (
    <SkeletonStatus className="gap-1.5">
      {Array.from({ length: SKELETON_ROWS }, (_, row) => (
        <div
          key={row}
          className="flex items-center gap-3 rounded-md border border-border-1 bg-surface px-3 py-2.5"
        >
          <Skeleton className="size-3.5 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className={row % 2 ? 'w-1/2' : 'w-2/3'} />
            <Skeleton className="h-2.5 w-1/3 opacity-60" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </SkeletonStatus>
  );
}

function InboxGroups({
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
  const reason = useUi((ui) => ui.prReason);
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
  const filtering = isFiltering(filter, reason);
  const groups = INBOX_GROUPS.filter(
    (group) => !reason || group.reason === reason,
  );
  const shown = matching.filter((pr) => !reason || pr.reason === reason);
  if (filtering && inbox.value.length && !shown.length) return <NoMatch />;
  return groups.map((group) => {
    const prs = shown.filter((pr) => pr.reason === group.reason);
    return (
      <section
        key={group.reason}
        aria-label={group.title}
        className="flex flex-col gap-2"
      >
        <h2 className="m-0 flex items-center gap-2 type-overline text-fg-4">
          {group.title}
          {prs.length ? <Badge count>{prs.length}</Badge> : null}
        </h2>
        {prs.length ? (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {prs.map((pr) => (
              <PullRequestRow key={pr.url} state={state} pr={pr} />
            ))}
          </ul>
        ) : (
          <p className="m-0 text-sm text-fg-3">
            {filtering ? NO_MATCH : group.empty}
          </p>
        )}
      </section>
    );
  });
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
          sidebar ? 'pl-4' : TRAFFIC_LIGHT_GUTTER,
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
        <div className="flex flex-none justify-center border-b border-border-1 px-6 py-3">
          <div className="w-full max-w-[960px]">
            <FilterBar state={state} prs={inbox.value} matching={matching} />
          </div>
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 py-6 [scrollbar-gutter:stable_both-edges]">
        <div className="flex w-full max-w-[960px] flex-col gap-6">
          <InboxGroups
            state={state}
            inbox={inbox}
            matching={matching}
            onRetry={refresh}
          />
        </div>
      </div>
    </div>
  );
}
