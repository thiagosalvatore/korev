import type { ReviewRequest } from '../shared/inbox';
import type {
  PullRequest,
  ReviewRequestEvent,
  Reviewer,
} from '../shared/pull-request';

export interface ViewerTeam {
  org: string;
  slug: string;
  members: string[];
}

export interface Viewer {
  login: string | null;
  teams: ViewerTeam[];
}

export function sameName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function sameReviewer(a: Reviewer, b: Reviewer): boolean {
  if (a.kind === 'user' && b.kind === 'user') return sameName(a.login, b.login);
  if (a.kind === 'team' && b.kind === 'team') {
    return sameName(a.org, b.org) && sameName(a.slug, b.slug);
  }
  return false;
}

function isViewer(reviewer: Reviewer, viewer: Viewer): boolean {
  if (reviewer.kind === 'user') {
    return viewer.login !== null && sameName(reviewer.login, viewer.login);
  }
  return viewer.teams.some((team) =>
    sameReviewer(reviewer, { kind: 'team', org: team.org, slug: team.slug }),
  );
}

function isPending(reviewer: Reviewer, pr: PullRequest): boolean {
  return pr.pendingReviewers.some((pending) => sameReviewer(pending, reviewer));
}

export function requestingViewerTeams(
  pr: PullRequest,
  viewer: Viewer,
): ViewerTeam[] {
  return viewer.teams.filter((team) =>
    isPending({ kind: 'team', org: team.org, slug: team.slug }, pr),
  );
}

function teamHandle(reviewer: Reviewer): string | null {
  if (reviewer.kind === 'user') return null;
  return `@${reviewer.org}/${reviewer.slug}`;
}

function latest(events: ReviewRequestEvent[]): ReviewRequestEvent | undefined {
  return events.reduce<ReviewRequestEvent | undefined>(
    (newest, event) =>
      !newest || Date.parse(event.createdAt) > Date.parse(newest.createdAt)
        ? event
        : newest,
    undefined,
  );
}

function bestMatch(
  pr: PullRequest,
  viewer: Viewer,
): ReviewRequestEvent | undefined {
  const matches = pr.reviewRequestEvents.filter(
    (event) =>
      isViewer(event.reviewer, viewer) && isPending(event.reviewer, pr),
  );
  const direct = matches.filter((event) => event.reviewer.kind === 'user');
  const viewerMatch = latest(direct) ?? latest(matches);
  if (viewerMatch || isPendingUser(pr, viewer)) return viewerMatch;
  return latestPendingTeamRequest(pr);
}

function isPendingUser(pr: PullRequest, viewer: Viewer): boolean {
  return pr.pendingReviewers.some(
    (reviewer) => reviewer.kind === 'user' && isViewer(reviewer, viewer),
  );
}

function latestPendingTeamRequest(
  pr: PullRequest,
): ReviewRequestEvent | undefined {
  return latest(
    pr.reviewRequestEvents.filter(
      (event) =>
        event.reviewer.kind === 'team' && isPending(event.reviewer, pr),
    ),
  );
}

function approximateRequest(pr: PullRequest, viewer: Viewer): ReviewRequest {
  const pendingForViewer = pr.pendingReviewers.filter((reviewer) =>
    isViewer(reviewer, viewer),
  );
  const direct = pendingForViewer.some((reviewer) => reviewer.kind === 'user');
  const team = direct ? undefined : pendingForViewer[0];
  return {
    requestedAt: pr.createdAt,
    approximate: true,
    direct,
    team: team ? teamHandle(team) : null,
  };
}

export function reviewRequestFor(
  pr: PullRequest,
  viewer: Viewer,
): ReviewRequest {
  const match = bestMatch(pr, viewer);
  if (!match) return approximateRequest(pr, viewer);
  return {
    requestedAt: match.createdAt,
    approximate: false,
    direct: match.reviewer.kind === 'user',
    team: teamHandle(match.reviewer),
  };
}
