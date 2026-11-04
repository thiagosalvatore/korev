import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  cn,
  Icon,
  IconButton,
  type BadgeTone,
} from '../design-system';
import { timeAgo } from '../shared/format';
import type {
  AppState,
  InboxPullRequest,
  InboxReason,
  Result,
} from '../shared/model';
import {
  checkOutPullRequest,
  explainPullRequest,
  openAsk,
  reviewInboxPullRequest,
  selectWorkspace,
} from './actions';
import { api } from './bridge';
import { DRAG_REGION, NO_DRAG, TRAFFIC_LIGHT_GUTTER } from './layout';
import { useUi } from './ui-store';

const REFRESH_MS = 120_000;

const GROUPS: { reason: InboxReason; title: string; empty: string }[] = [
  {
    reason: 'review-requested',
    title: 'Waiting for your review',
    empty: 'Nobody is waiting for your review.',
  },
  {
    reason: 'authored',
    title: 'Opened by you',
    empty: 'You have no open pull requests.',
  },
];

const STATUSES: {
  label: string;
  tone: BadgeTone;
  shows(pr: InboxPullRequest): boolean;
}[] = [
  { label: 'Draft', tone: 'neutral', shows: (pr) => pr.isDraft },
  {
    label: 'Checks failing',
    tone: 'danger',
    shows: (pr) => pr.checks === 'failure',
  },
  {
    label: 'Checks running',
    tone: 'warning',
    shows: (pr) => pr.checks === 'pending',
  },
  {
    label: 'Approved',
    tone: 'success',
    shows: (pr) => pr.reviewDecision === 'APPROVED',
  },
  {
    label: 'Changes requested',
    tone: 'warning',
    shows: (pr) => pr.reviewDecision === 'CHANGES_REQUESTED',
  },
  {
    label: 'Conflicts',
    tone: 'danger',
    shows: (pr) => pr.mergeable === 'CONFLICTING',
  },
];

function useInbox() {
  const [inbox, setInbox] = useState<Result<InboxPullRequest[]> | null>(null);
  const refresh = useCallback(async () => {
    setInbox(await api.pullRequestInbox());
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);
  return { inbox, refresh };
}

function PullRequestRow({
  state,
  pr,
}: {
  state: AppState;
  pr: InboxPullRequest;
}) {
  const label = `#${pr.number} ${pr.title}`;
  const review = state.askChats.find((ask) => ask.reviewOf === pr.url);
  const workspace = state.workspaces.find((ws) =>
    ws.prs.some((tracked) => tracked.url === pr.url),
  );
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
        {STATUSES.filter((status) => status.shows(pr)).map((status) => (
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

function InboxGroups({
  state,
  inbox,
}: {
  state: AppState;
  inbox: Result<InboxPullRequest[]> | null;
}) {
  if (!inbox) return <p className="m-0 text-sm text-fg-3">Loading…</p>;
  if (!inbox.ok)
    return <p className="m-0 text-sm text-danger-text">{inbox.message}</p>;
  return GROUPS.map((group) => {
    const prs = inbox.value.filter((pr) => pr.reason === group.reason);
    return (
      <section
        key={group.reason}
        aria-label={group.title}
        className="flex flex-col gap-2"
      >
        <h2 className="m-0 type-overline text-fg-4">{group.title}</h2>
        {prs.length ? (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {prs.map((pr) => (
              <PullRequestRow key={pr.url} state={state} pr={pr} />
            ))}
          </ul>
        ) : (
          <p className="m-0 text-sm text-fg-3">{group.empty}</p>
        )}
      </section>
    );
  });
}

export function PullRequestsPage({ state }: { state: AppState }) {
  const sidebar = useUi((ui) => ui.sidebar);
  const { inbox, refresh } = useInbox();
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div
        className={cn(
          'flex h-11 flex-none items-center justify-between border-b border-border-1 pr-2',
          DRAG_REGION,
          sidebar ? 'pl-4' : TRAFFIC_LIGHT_GUTTER,
        )}
      >
        <h1 className="m-0 text-sm font-semibold text-fg-1">Pull requests</h1>
        <IconButton
          icon="refresh-cw"
          label="Refresh"
          size="sm"
          className={NO_DRAG}
          onClick={refresh}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 py-6">
        <div className="flex w-full max-w-[960px] flex-col gap-6">
          <InboxGroups state={state} inbox={inbox} />
        </div>
      </div>
    </div>
  );
}
