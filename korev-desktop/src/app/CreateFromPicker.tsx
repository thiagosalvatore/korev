import { useEffect, useMemo, useState } from 'react';
import { cn, Icon, Tabs, type IconName } from '../design-system';
import type { IssueSummary, PullRequestSummary } from '../shared/model';
import { api } from './bridge';
import { fuzzyRank } from './fuzzy';

export type CreateFrom =
  | { kind: 'branch'; branch: string }
  | { kind: 'pr'; pr: PullRequestSummary }
  | { kind: 'issue'; issue: IssueSummary };

type PickerTab = 'branches' | 'prs' | 'issues';

interface Option {
  key: string;
  label: string;
  detail: string;
  icon: IconName;
  value: CreateFrom;
}

const TABS: { id: PickerTab; label: string }[] = [
  { id: 'branches', label: 'Branches' },
  { id: 'prs', label: 'Pull requests' },
  { id: 'issues', label: 'GitHub issues' },
];
const RESULT_LIMIT = 50;
const SEARCH_DELAY_MS = 250;

export function createFromLabel(source: CreateFrom): string {
  if (source.kind === 'branch') return source.branch;
  if (source.kind === 'pr') return `#${source.pr.number} ${source.pr.title}`;
  return `#${source.issue.number} ${source.issue.title}`;
}

export function issuePrompt(issue: IssueSummary, text: string): string {
  const heading =
    `GitHub issue #${issue.number}: ${issue.title}\n${issue.url}\n\n${issue.body}`.trim();
  return text.trim()
    ? `${heading}\n\n${text}`
    : `${heading}\n\nWork on this issue.`;
}

function useOptions(
  repoId: string,
  tab: PickerTab,
  remoteQuery: string,
): Option[] | null {
  const [options, setOptions] = useState<Option[] | null>(null);
  useEffect(() => {
    let current = true;
    setOptions(null);
    const load = async (): Promise<Option[]> => {
      if (tab === 'branches') {
        return (await api.listBranches(repoId)).map((branch) => ({
          key: branch,
          label: branch,
          detail: '',
          icon: 'git-branch',
          value: { kind: 'branch', branch },
        }));
      }
      if (tab === 'prs') {
        return (await api.listPullRequests(repoId, remoteQuery)).map((pr) => ({
          key: String(pr.number),
          label: `#${pr.number} ${pr.title}`,
          detail: `${pr.headRefName} · @${pr.author}`,
          icon: pr.isDraft ? 'git-pull-request-draft' : 'git-pull-request',
          value: { kind: 'pr', pr },
        }));
      }
      return (await api.listIssues(repoId, remoteQuery)).map((issue) => ({
        key: String(issue.number),
        label: `#${issue.number} ${issue.title}`,
        detail: '',
        icon: 'circle-dot',
        value: { kind: 'issue', issue },
      }));
    };
    const timer = setTimeout(
      () => {
        void load().then((loaded) => {
          if (current) setOptions(loaded);
        });
      },
      remoteQuery ? SEARCH_DELAY_MS : 0,
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [repoId, tab, remoteQuery]);
  return options;
}

export function CreateFromPicker({
  repoId,
  onSelect,
  onClose,
}: {
  repoId: string;
  onSelect: (source: CreateFrom) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<PickerTab>('branches');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const searchesGitHub = tab !== 'branches';
  const options = useOptions(repoId, tab, searchesGitHub ? query.trim() : '');
  const results = useMemo(() => {
    if (!options) return [];
    if (searchesGitHub || !query.trim()) return options.slice(0, RESULT_LIMIT);
    const byLabel = new Map(
      options.map((option) => [`${option.label} ${option.detail}`, option]),
    );
    return fuzzyRank(query.trim(), [...byLabel.keys()], RESULT_LIMIT).flatMap(
      (key) => byLabel.get(key) ?? [],
    );
  }, [options, query, searchesGitHub]);

  return (
    <div
      role="dialog"
      aria-label="Create from"
      className="overflow-hidden rounded-lg border border-border-2 bg-raised shadow-pop"
    >
      <div className="flex items-center gap-2 border-b border-border-1 pr-2">
        <Tabs
          className="flex-1 border-b-0 px-1.5"
          tabs={TABS}
          value={tab}
          onChange={(id) => {
            setTab(id as PickerTab);
            setSelected(0);
          }}
        />
        <span className="text-2xs text-fg-4">⌘I</span>
      </div>
      <input
        autoFocus
        aria-label="Search sources"
        value={query}
        placeholder="Search"
        className="h-9 w-full border-0 border-b border-border-1 bg-transparent px-3 text-sm text-fg-1 outline-none placeholder:text-fg-4"
        onChange={(event) => {
          setQuery(event.target.value);
          setSelected(0);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
          if (event.key === 'Tab') {
            event.preventDefault();
            const index = TABS.findIndex((entry) => entry.id === tab);
            const step = event.shiftKey ? -1 : 1;
            setTab(TABS[(index + step + TABS.length) % TABS.length].id);
          }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const step = event.key === 'ArrowDown' ? 1 : -1;
            setSelected(
              (value) =>
                (value + step + results.length) % Math.max(results.length, 1),
            );
          }
          if (event.key === 'Enter' && results[selected])
            onSelect(results[selected].value);
        }}
      />
      <div
        role="listbox"
        aria-label="Sources"
        className="max-h-64 overflow-y-auto p-1"
      >
        {options === null ? (
          <p className="m-0 px-3 py-4 text-sm text-fg-3">Loading…</p>
        ) : null}
        {options && !results.length ? (
          <p className="m-0 px-3 py-4 text-sm text-fg-3">Nothing found</p>
        ) : null}
        {results.map((option, index) => (
          <button
            key={option.key}
            type="button"
            role="option"
            aria-selected={index === selected}
            className={cn(
              'flex h-8 w-full cursor-pointer items-center gap-2 rounded-sm border-0 bg-transparent px-2 text-left text-sm text-fg-1',
              index === selected && 'bg-active',
            )}
            onMouseMove={() => setSelected(index)}
            onClick={() => onSelect(option.value)}
          >
            <Icon name={option.icon} size={13} className="text-fg-3" />
            <span className="truncate">{option.label}</span>
            <span className="truncate text-xs text-fg-4">{option.detail}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
