import { useEffect, useMemo, useRef, useState } from 'react';
import { cn, Icon, Kbd, type IconName } from '../design-system';
import type { AppState, ChatMatch, Workspace } from '../shared/model';
import {
  activateTab,
  archiveWorkspace,
  createPr,
  explainWorkspace,
  openPrPicker,
  newChat,
  openBoard,
  openDiff,
  openFile,
  openSearch,
  openAsk,
  openNewWorkspace,
  openRuns,
  openSettings,
  restoreWorkspace,
  selectWorkspace,
  toggleHandsFree,
} from './actions';
import { fuzzyRank } from './fuzzy';
import { api } from './bridge';
import { fileName, timeAgo } from '../shared/format';
import { workspaceLabel } from '../shared/workspaces';
import { openProject } from './Sidebar';
import { setUi, tabKey, useUi } from './ui-store';

interface PaletteItem {
  id: string;
  label: string;
  detail?: string;
  icon: IconName;
  hint?: string;
  section: string;
  run: () => void;
}

const RESULT_LIMIT = 40;
const CHAT_SEARCH_DELAY_MS = 150;
const CHAT_SEARCH_MIN_CHARS = 2;

function prNumbers(workspace: Workspace): string {
  return workspace.prs
    .map((pr) => ` · #${pr.url.slice(pr.url.lastIndexOf('/') + 1)}`)
    .join('');
}

function paletteItems(
  state: AppState,
  workspaceId: string | null,
): PaletteItem[] {
  const current = state.workspaces.find(
    (ws) => ws.id === workspaceId && !ws.archivedAt,
  );
  const repoName = (repoId: string) =>
    state.repos.find((repo) => repo.id === repoId)?.name ?? '';
  const workspaces = state.workspaces
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(
      (ws): PaletteItem => ({
        id: `ws:${ws.id}`,
        label: ws.branch,
        detail: `${repoName(ws.repoId)} · ${workspaceLabel(ws)}${prNumbers(ws)}${ws.archivedAt ? ' · archived' : ''} · ${timeAgo(ws.createdAt)}`,
        icon: ws.archivedAt ? 'archive' : 'git-branch',
        section: 'Workspaces',
        run: () =>
          ws.archivedAt ? void restoreWorkspace(ws) : selectWorkspace(ws.id),
      }),
    );
  const actions: PaletteItem[] = [
    {
      id: 'new-ws',
      label: 'New workspace',
      icon: 'square-pen',
      hint: '⌘N',
      section: 'Actions',
      run: () => openNewWorkspace(null),
    },
    {
      id: 'board',
      label: 'Agent board',
      icon: 'square-kanban',
      hint: '⌘⇧B',
      section: 'Actions',
      run: openBoard,
    },
    {
      id: 'add-repo',
      label: 'Add repository',
      icon: 'folder-plus',
      section: 'Actions',
      run: () => void openProject(),
    },
    {
      id: 'explain-pr',
      label: 'Explain a pull request…',
      icon: 'book-open-text',
      section: 'Actions',
      run: () => openPrPicker('explain'),
    },
    {
      id: 'review-pr',
      label: 'Review a pull request…',
      icon: 'git-pull-request',
      hint: '⌘⇧R',
      section: 'Actions',
      run: () => openPrPicker('review'),
    },
    {
      id: 'runs',
      label: 'Orchestration runs',
      icon: 'network',
      section: 'Actions',
      run: openRuns,
    },
    {
      id: 'hands-free',
      label: 'Hands-free mode',
      icon: 'audio-lines',
      hint: '⌘⇧H',
      section: 'Actions',
      run: toggleHandsFree,
    },
    ...(current
      ? [
          {
            id: 'chat',
            label: 'New chat',
            icon: 'message-square-plus',
            hint: '⌘T',
            section: 'Actions',
            run: () => void newChat(current, state.settings.defaultAgent),
          } as PaletteItem,
          {
            id: 'diff',
            label: 'Open diff view',
            icon: 'git-compare',
            hint: '⌘⇧D',
            section: 'Actions',
            run: () => openDiff(current.id),
          } as PaletteItem,
          {
            id: 'explain',
            label: 'Explain these changes',
            icon: 'book-open-text',
            section: 'Actions',
            run: () => void explainWorkspace(current),
          } as PaletteItem,
          {
            id: 'pr',
            label: 'Create PR',
            icon: 'git-pull-request-arrow',
            hint: '⌘⇧P',
            section: 'Actions',
            run: () => void createPr(current),
          } as PaletteItem,
          {
            id: 'archive',
            label: `Archive ${current.name}`,
            icon: 'archive',
            hint: '⌘⇧A',
            section: 'Actions',
            run: () => void archiveWorkspace(state, current),
          } as PaletteItem,
        ]
      : []),
    ...(current
      ? [
          {
            id: 'quick-open',
            label: 'Quick open file',
            icon: 'file-search',
            hint: '⌘P',
            section: 'Actions',
            run: () => setUi({ palette: 'files' }),
          } as PaletteItem,
          {
            id: 'search',
            label: 'Search in files',
            icon: 'search',
            hint: '⌘⇧F',
            section: 'Actions',
            run: () => openSearch(current.id),
          } as PaletteItem,
        ]
      : []),
    {
      id: 'settings',
      label: 'Settings',
      icon: 'settings',
      hint: '⌘,',
      section: 'Settings',
      run: () => openSettings(),
    },
    ...state.repos.map(
      (repo): PaletteItem => ({
        id: `repo:${repo.id}`,
        label: `${repo.name} settings`,
        icon: 'folder-git-2',
        section: 'Settings',
        run: () => openSettings(`repo:${repo.id}`),
      }),
    ),
  ];
  return [...workspaces, ...actions];
}

async function openChat(workspace: Workspace, sessionId: string) {
  if (workspace.archivedAt) await restoreWorkspace(workspace);
  else selectWorkspace(workspace.id);
  activateTab(workspace.id, tabKey({ kind: 'chat', sessionId }));
}

function chatItems(state: AppState, matches: ChatMatch[]): PaletteItem[] {
  return matches.flatMap((match): PaletteItem[] => {
    const id = `chat:${match.sessionId}`;
    if (match.owner.kind === 'ask') {
      const askChatId = match.owner.id;
      return [
        {
          id,
          label: match.title,
          detail: match.snippet,
          icon: 'message-circle-question',
          section: 'Threads',
          run: () => openAsk(askChatId),
        },
      ];
    }
    const workspace = state.workspaces.find((ws) => ws.id === match.owner.id);
    if (!workspace) return [];
    return [
      {
        id,
        label: match.title,
        detail: `${workspace.branch} · ${match.snippet}`,
        icon: 'message-square',
        section: 'Threads',
        run: () => void openChat(workspace, match.sessionId),
      },
    ];
  });
}

function useChatMatches(query: string): ChatMatch[] {
  const [matches, setMatches] = useState<ChatMatch[]>([]);
  useEffect(() => {
    const needle = query.trim();
    if (needle.length < CHAT_SEARCH_MIN_CHARS) {
      setMatches([]);
      return undefined;
    }
    let current = true;
    const timer = setTimeout(() => {
      void api.searchChats(needle).then((found) => {
        if (current) setMatches(found);
      });
    }, CHAT_SEARCH_DELAY_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query]);
  return matches;
}

function useWorkspaceFiles(workspaceId: string | null): string[] {
  const [files, setFiles] = useState<string[]>([]);
  useEffect(() => {
    if (!workspaceId) return;
    void api
      .listFiles(workspaceId)
      .then(setFiles)
      .catch(() => setFiles([]));
  }, [workspaceId]);
  return files;
}

function fileItems(workspaceId: string | null, files: string[]): PaletteItem[] {
  if (!workspaceId) return [];
  return files.map((file) => ({
    id: `file:${file}`,
    label: fileName(file),
    detail: file,
    icon: 'file',
    section: 'Files',
    run: () => openFile(workspaceId, file),
  }));
}

export function CommandPalette({ state }: { state: AppState }) {
  const open = useUi((ui) => ui.palette);
  const workspaceId = useUi((ui) => ui.workspaceId);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const files = useWorkspaceFiles(open === 'files' ? workspaceId : null);
  const chatMatches = useChatMatches(open === 'files' ? '' : query);
  const items = useMemo(
    () =>
      open === 'files'
        ? fileItems(workspaceId, files)
        : paletteItems(state, workspaceId),
    [open, state, workspaceId, files],
  );
  const results = useMemo(() => {
    if (!query.trim()) return items.slice(0, RESULT_LIMIT);
    const byKey = new Map(
      items.map((item) => [`${item.label} ${item.detail ?? ''}`, item]),
    );
    const ranked = fuzzyRank(query.trim(), [...byKey.keys()], RESULT_LIMIT);
    return [
      ...ranked.flatMap((key) => byKey.get(key) ?? []),
      ...chatItems(state, chatMatches),
    ];
  }, [items, query, state, chatMatches]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(0);
    requestAnimationFrame(() => input.current?.focus());
  }, [open]);

  if (!open) return null;
  const close = () => setUi({ palette: false });
  const run = (item: PaletteItem | undefined) => {
    if (!item) return;
    if (item.id !== 'quick-open') close();
    item.run();
  };
  let lastSection = '';
  return (
    <div
      className="fixed inset-0 z-100 flex items-start justify-center bg-overlay pt-[14vh]"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <div
        role="dialog"
        aria-label="Command palette"
        className="flex w-[min(640px,calc(100vw-32px))] animate-rise flex-col overflow-hidden rounded-lg bg-raised shadow-overlay"
      >
        <div className="flex items-center gap-2 border-b border-border-1 px-4">
          <Icon name="search" size={15} className="text-fg-3" />
          <input
            ref={input}
            aria-label="Search"
            value={query}
            placeholder={
              open === 'files'
                ? 'Go to file'
                : 'Search workspaces, threads, actions and settings'
            }
            className="h-12 flex-1 border-0 bg-transparent text-md text-fg-1 outline-none placeholder:text-fg-4"
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') close();
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const step = event.key === 'ArrowDown' ? 1 : -1;
                setSelected(
                  (value) =>
                    (value + step + results.length) %
                    Math.max(results.length, 1),
                );
              }
              if (event.key === 'Enter') run(results[selected]);
            }}
          />
        </div>
        <div
          role="listbox"
          aria-label="Results"
          className="max-h-[50vh] overflow-y-auto p-1.5"
        >
          {results.map((item, index) => {
            const header = item.section !== lastSection ? item.section : null;
            lastSection = item.section;
            return (
              <div key={item.id}>
                {header && !query ? (
                  <div className="px-2 pt-2 pb-1 type-overline text-fg-4">
                    {header}
                  </div>
                ) : null}
                <button
                  type="button"
                  role="option"
                  aria-selected={index === selected}
                  className={cn(
                    'flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-md border-0 bg-transparent px-2.5 text-left text-sm text-fg-1',
                    index === selected && 'bg-active',
                  )}
                  onMouseMove={() => setSelected(index)}
                  onClick={() => run(item)}
                >
                  <Icon name={item.icon} size={14} className="text-fg-3" />
                  <span className="max-w-1/2 flex-none truncate">
                    {item.label}
                  </span>
                  {item.detail ? (
                    <span className="truncate text-xs text-fg-4">
                      {item.detail}
                    </span>
                  ) : null}
                  <span className="flex-1" />
                  {item.hint ? <Kbd>{item.hint}</Kbd> : null}
                </button>
              </div>
            );
          })}
          {!results.length ? (
            <p className="m-0 px-3 py-6 text-center text-sm text-fg-3">
              No results
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
