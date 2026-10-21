import { useEffect, useMemo, useState } from 'react';
import { cn, Dialog, Icon, Select } from '../design-system';
import { parsePrUrl } from '../shared/explainer';
import type { AppState, PullRequestSummary } from '../shared/model';
import { explainPullRequest, reviewPullRequest } from './actions';
import { api } from './bridge';
import { getUi, setUi, useUi, type PrPickerPurpose } from './ui-store';

const REVIEW_REQUESTED = 'review-requested:@me';
const OPENED_BY_ME = 'author:@me';
const SEARCH_DELAY_MS = 250;
const DIALOG_WIDTH = 620;

interface Option {
  repoId: string;
  number: number;
  label: string;
  detail: string;
  draft: boolean;
}

interface Group {
  title: string;
  options: Option[];
}

interface Purpose {
  title: string;
  description: string;
  verb: string;
  choose(option: Option): Promise<void> | void;
}

const PURPOSES: Record<PrPickerPurpose, Purpose> = {
  explain: {
    title: 'Explain a pull request',
    description:
      'Korev reads the pull request and explains it in plain words, step by step. Nothing is checked out or changed.',
    verb: 'explain',
    choose: (option) => explainPullRequest(option.repoId, option.number),
  },
  review: {
    title: 'Review a pull request',
    description:
      'Korev starts an Ask about the pull request. Say what to review, or run a review skill with /. Nothing is checked out or changed.',
    verb: 'review',
    choose: (option) => reviewPullRequest(option.repoId, option.label),
  },
};

function toOption(repoId: string, pr: PullRequestSummary): Option {
  return {
    repoId,
    number: pr.number,
    label: `#${pr.number} ${pr.title}`,
    detail: `@${pr.author} · ${pr.headRefName}`,
    draft: pr.isDraft,
  };
}

function usePullRequests(repoId: string, search: string, delayMs = 0) {
  const [prs, setPrs] = useState<PullRequestSummary[] | null>(null);
  useEffect(() => {
    let current = true;
    setPrs(null);
    const timer = setTimeout(() => {
      void api.listPullRequests(repoId, search).then((loaded) => {
        if (current) setPrs(loaded);
      });
    }, delayMs);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [repoId, search, delayMs]);
  return prs;
}

function useGithubRepos(state: AppState) {
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let current = true;
    void Promise.all(
      state.repos.map(
        async (repo) =>
          [repo.id, (await api.repoGithubUrl(repo.id)) ?? ''] as const,
      ),
    ).then((entries) => {
      if (current) setUrls(new Map(entries));
    });
    return () => {
      current = false;
    };
  }, [state.repos]);
  return urls;
}

function defaultRepoId(state: AppState): string {
  const ui = getUi();
  const workspace = state.workspaces.find((ws) => ws.id === ui.workspaceId);
  if (ui.page.kind === 'ask' && ui.page.repoIds[0]) return ui.page.repoIds[0];
  return workspace?.repoId ?? state.repos[0]?.id ?? '';
}

function useGroups(
  state: AppState,
  repoId: string,
  query: string,
): Group[] | null {
  const trimmed = query.trim();
  const pasted = useMemo(() => parsePrUrl(trimmed), [trimmed]);
  const githubUrls = useGithubRepos(state);
  const search = pasted ? '' : trimmed;
  const requested = usePullRequests(repoId, REVIEW_REQUESTED);
  const mine = usePullRequests(repoId, OPENED_BY_ME);
  const open = usePullRequests(repoId, search, search ? SEARCH_DELAY_MS : 0);
  return useMemo(() => {
    if (pasted) {
      const slug = `github.com/${pasted.owner}/${pasted.repo}`.toLowerCase();
      const repo = state.repos.find((entry) =>
        (githubUrls.get(entry.id) ?? '').toLowerCase().endsWith(slug),
      );
      if (!repo) return [];
      return [
        {
          title: repo.name,
          options: [
            {
              repoId: repo.id,
              number: pasted.number,
              label: `#${pasted.number}`,
              detail: `${pasted.owner}/${pasted.repo}`,
              draft: false,
            },
          ],
        },
      ];
    }
    if (!open || (!search && (!requested || !mine))) return null;
    const toOptions = (list: PullRequestSummary[]) =>
      list.map((pr) => toOption(repoId, pr));
    if (search) return [{ title: 'Results', options: toOptions(open) }];
    const listed = new Set(
      [...(requested ?? []), ...(mine ?? [])].map((pr) => pr.number),
    );
    return [
      { title: 'Waiting for your review', options: toOptions(requested ?? []) },
      { title: 'Opened by you', options: toOptions(mine ?? []) },
      {
        title: 'Other open pull requests',
        options: toOptions(open.filter((pr) => !listed.has(pr.number))),
      },
    ].filter((group) => group.options.length);
  }, [pasted, githubUrls, state.repos, open, requested, mine, search, repoId]);
}

function PrPicker({ state, purpose }: { state: AppState; purpose: Purpose }) {
  const [repoId, setRepoId] = useState(() => defaultRepoId(state));
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [starting, setStarting] = useState<number | null>(null);
  const groups = useGroups(state, repoId, query);
  const options = groups?.flatMap((group) => group.options) ?? [];
  const pasted = parsePrUrl(query.trim());

  async function choose(option: Option | undefined) {
    if (!option || starting !== null) return;
    setStarting(option.number);
    await purpose.choose(option);
    setStarting(null);
  }

  return (
    <div className="flex flex-col gap-3">
      {state.repos.length > 1 ? (
        <Select
          ariaLabel="Repository"
          icon="folder-git-2"
          options={state.repos.map((repo) => ({
            value: repo.id,
            label: repo.name,
          }))}
          value={repoId}
          onChange={(value) => {
            setRepoId(value);
            setSelected(0);
          }}
        />
      ) : null}
      <div className="overflow-hidden rounded-md border border-border-2 bg-surface">
        <input
          autoFocus
          aria-label="Search pull requests or paste a link"
          value={query}
          placeholder="Search, or paste a pull request link"
          className="h-9 w-full border-0 border-b border-border-1 bg-transparent px-3 text-sm text-fg-1 outline-none placeholder:text-fg-4"
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              const step = event.key === 'ArrowDown' ? 1 : -1;
              setSelected(
                (value) =>
                  (value + step + options.length) % Math.max(options.length, 1),
              );
            }
            if (event.key === 'Enter') void choose(options[selected]);
          }}
        />
        <div
          role="listbox"
          aria-label="Pull requests"
          className="max-h-80 overflow-y-auto p-1"
        >
          {groups === null ? (
            <p className="m-0 px-3 py-4 text-sm text-fg-3">Loading…</p>
          ) : null}
          {groups && !options.length ? (
            <p className="m-0 px-3 py-4 text-sm text-fg-3">
              {pasted
                ? `Add ${pasted.owner}/${pasted.repo} to Korev to ${purpose.verb} its pull requests.`
                : 'No open pull requests found'}
            </p>
          ) : null}
          {groups?.map((group) => (
            <div key={group.title} role="group" aria-label={group.title}>
              <div className="px-2 pt-2 pb-1 type-overline text-fg-4">
                {group.title}
              </div>
              {group.options.map((option) => {
                const index = options.indexOf(option);
                return (
                  <button
                    key={`${option.repoId}:${option.number}`}
                    type="button"
                    role="option"
                    aria-selected={index === selected}
                    disabled={starting !== null}
                    className={cn(
                      'flex h-8 w-full cursor-pointer items-center gap-2 rounded-sm border-0 bg-transparent px-2 text-left text-sm text-fg-1 disabled:cursor-wait',
                      index === selected && 'bg-active',
                    )}
                    onMouseMove={() => setSelected(index)}
                    onClick={() => void choose(option)}
                  >
                    {starting === option.number ? (
                      <Icon
                        name="loader-circle"
                        size={13}
                        className="animate-spin text-fg-3"
                      />
                    ) : (
                      <Icon
                        name={
                          option.draft
                            ? 'git-pull-request-draft'
                            : 'git-pull-request'
                        }
                        size={13}
                        className="text-fg-3"
                      />
                    )}
                    <span className="truncate">{option.label}</span>
                    <span className="truncate text-xs text-fg-4">
                      {option.detail}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PrPickerDialog({ state }: { state: AppState }) {
  const purposeKey = useUi((ui) => ui.prPicker);
  const purpose = PURPOSES[purposeKey ?? 'explain'];
  return (
    <Dialog
      open={purposeKey !== null}
      onClose={() => setUi({ prPicker: null })}
      title={purpose.title}
      description={purpose.description}
      width={DIALOG_WIDTH}
    >
      {purposeKey ? <PrPicker state={state} purpose={purpose} /> : null}
    </Dialog>
  );
}
