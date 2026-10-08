import { Button, cn, Icon, IconButton } from '../design-system';
import {
  hasWorktree,
  type AppState,
  type Workspace,
  type TerminalPreset,
  type WorkspaceRuntime,
} from '../shared/model';
import {
  activateTab,
  archiveWorkspace,
  closeTab,
  focusComposer,
  newChat,
  openBrowser,
  openTerminalTab,
  terminalTabRef,
} from './actions';
import { ChatView } from './chat/ChatView';
import { DiffView } from './diff/DiffView';
import { FileView } from './FileView';
import { PrComments } from './comments/PrComments';
import { SearchView } from './SearchView';
import { BrowserView } from './BrowserView';
import { XTerm } from './XTerm';
import { fileName } from '../shared/format';
import { worktreeProgress } from '../shared/workspaces';
import { DRAG_REGION } from './layout';
import { GitPanel } from './GitPanel';
import { CollapsedTerminalBar, TerminalPanel } from './TerminalPanel';
import { Menu, type MenuItem } from './ui/Menu';
import { EMPTY_WORKSPACE_UI, tabKey, useUi, type MainTab } from './ui-store';
import { WorkspaceHeader } from './WorkspaceHeader';

interface TabEntry {
  key: string;
  tab: MainTab;
  label: string;
  running: boolean;
  closable: boolean;
}

function tabsOf(
  state: AppState,
  workspace: Workspace,
  extraTabs: MainTab[],
): TabEntry[] {
  const chats = workspace.sessions.map((session) => ({
    key: tabKey({ kind: 'chat', sessionId: session.id }),
    tab: { kind: 'chat' as const, sessionId: session.id },
    label: session.title,
    running: state.runningSessions.includes(session.id),
    closable: workspace.sessions.length > 1,
  }));
  const others = extraTabs.map((tab) => ({
    key: tabKey(tab),
    tab,
    label: extraTabLabel(tab),
    running: false,
    closable: true,
  }));
  return [...chats, ...others];
}

const TAB_ICONS = {
  diff: 'git-compare',
  file: 'file',
  search: 'search',
  comments: 'message-square',
  terminal: 'square-terminal',
  browser: 'globe',
} as const;

export const PRESET_LABELS: Record<TerminalPreset, string> = {
  shell: 'Terminal',
  claude: 'Claude Code',
  codex: 'Codex',
};

export const TERMINAL_PRESETS = ['shell', 'claude', 'codex'] as const;

export function newTerminalLabel(preset: TerminalPreset): string {
  return preset === 'shell'
    ? 'New terminal'
    : `${PRESET_LABELS[preset]} in a terminal`;
}

function extraTabLabel(tab: MainTab): string {
  if (tab.kind === 'diff') return tab.range ? 'Turn changes' : 'Changes';
  if (tab.kind === 'file') return fileName(tab.file);
  if (tab.kind === 'search') return 'Search';
  if (tab.kind === 'comments') return 'Comments';
  if (tab.kind === 'terminal') return PRESET_LABELS[tab.preset];
  if (tab.kind === 'browser') return 'Browser';
  return '';
}

function newTabItems(state: AppState, workspace: Workspace): MenuItem[] {
  const runUrl = state.runtime[workspace.id]?.runUrl;
  return [
    {
      id: 'chat',
      label: 'New chat',
      icon: 'message-square-plus',
      hint: '⌘T',
      section: 'Chat',
      onSelect: () => void newChat(workspace, state.settings.defaultAgent),
    },
    ...TERMINAL_PRESETS.map(
      (preset): MenuItem => ({
        id: `terminal-${preset}`,
        label: newTerminalLabel(preset),
        icon: 'square-terminal',
        section: 'Terminal',
        onSelect: () => openTerminalTab(workspace.id, preset),
      }),
    ),
    {
      id: 'browser',
      label: 'New browser tab',
      icon: 'globe',
      section: 'Browser',
      onSelect: () =>
        openBrowser(
          workspace.id,
          runUrl ?? `http://localhost:${workspace.port}`,
        ),
    },
  ];
}

function TabStrip({
  state,
  workspace,
  tabs,
  activeKey,
}: {
  state: AppState;
  workspace: Workspace;
  tabs: TabEntry[];
  activeKey: string;
}) {
  return (
    <div className="flex h-9 flex-none items-stretch border-b border-border-1 bg-surface">
      <div
        role="tablist"
        aria-label="Tabs"
        className="flex min-w-0 items-stretch overflow-x-auto"
      >
        {tabs.map((entry) => {
          const selected = entry.key === activeKey;
          const session =
            entry.tab.kind === 'chat'
              ? workspace.sessions.find(
                  (item) =>
                    entry.tab.kind === 'chat' &&
                    item.id === entry.tab.sessionId,
                )
              : null;
          return (
            <div
              key={entry.key}
              role="tab"
              aria-selected={selected}
              tabIndex={0}
              className={cn(
                'group relative flex max-w-56 min-w-0 cursor-pointer items-center gap-1.5 border-r border-border-1 pr-1.5 pl-3 text-sm text-fg-3 hover:text-fg-1',
                selected &&
                  'bg-app text-fg-1 after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-app',
              )}
              onClick={() => activateTab(workspace.id, entry.key)}
              onAuxClick={(event) => {
                if (event.button === 1 && entry.closable)
                  void closeTab(workspace, entry.key);
              }}
            >
              {entry.running ? (
                <Icon
                  name="loader-circle"
                  size={13}
                  className="animate-spin text-accent-text"
                />
              ) : (
                <Icon
                  name={
                    session
                      ? session.agent === 'claude'
                        ? 'sparkle'
                        : 'hexagon'
                      : TAB_ICONS[entry.tab.kind as keyof typeof TAB_ICONS]
                  }
                  size={13}
                />
              )}
              <span className="truncate">{entry.label}</span>
              {entry.closable ? (
                <button
                  type="button"
                  aria-label={`Close ${entry.label}`}
                  className="flex size-5 cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent text-fg-4 opacity-0 group-hover:opacity-100 hover:bg-hover hover:text-fg-1"
                  onClick={(event) => {
                    event.stopPropagation();
                    void closeTab(workspace, entry.key);
                  }}
                >
                  <Icon name="x" size={12} />
                </button>
              ) : (
                <span className="w-1" />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center px-1">
        <Menu
          label="New tab"
          items={newTabItems(state, workspace)}
          trigger={({ toggle }) => (
            <IconButton
              icon="plus"
              label="New tab"
              size="sm"
              onClick={toggle}
            />
          )}
        />
      </div>
    </div>
  );
}

interface WorktreeStatusProps {
  state: AppState;
  workspace: Workspace;
  runtime: WorkspaceRuntime;
}

function WorkspaceWithoutWorktree(props: WorktreeStatusProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-app">
      <div className={cn('h-11 flex-none', DRAG_REGION)} />
      <WorktreePending {...props} />
    </div>
  );
}

export function WorktreePending({
  state,
  workspace,
  runtime,
}: WorktreeStatusProps) {
  const failed = runtime.status === 'failed';
  const progress = worktreeProgress(workspace, runtime);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      {failed ? (
        <Icon name="triangle-alert" size={22} className="text-danger-text" />
      ) : (
        <Icon
          name="loader-circle"
          size={22}
          className="animate-spin text-accent-text"
        />
      )}
      <p className="m-0 text-lg font-semibold text-fg-1">
        {failed ? runtime.message : progress.title}
      </p>
      {failed ? null : (
        <p className="m-0 text-sm text-fg-3">{progress.detail}</p>
      )}
      {runtime.pendingPrompt ? (
        <p className="m-0 max-w-xl rounded-md bg-raised px-3 py-2 text-left text-sm whitespace-pre-wrap text-fg-1">
          {runtime.pendingPrompt}
        </p>
      ) : null}
      {failed ? (
        <Button
          size="sm"
          variant="ghost"
          icon="archive"
          onClick={() => archiveWorkspace(state, workspace)}
        >
          Archive workspace
        </Button>
      ) : null}
    </div>
  );
}

export function WorkspaceView({
  state,
  workspace,
}: {
  state: AppState;
  workspace: Workspace;
}) {
  const runtime = state.runtime[workspace.id];
  if (runtime && !hasWorktree(runtime))
    return (
      <WorkspaceWithoutWorktree
        state={state}
        workspace={workspace}
        runtime={runtime}
      />
    );
  return <WorkspaceWithWorktree state={state} workspace={workspace} />;
}

function WorkspaceWithWorktree({
  state,
  workspace,
}: {
  state: AppState;
  workspace: Workspace;
}) {
  const ui = useUi(
    (value) => value.workspaces[workspace.id] ?? EMPTY_WORKSPACE_UI,
  );
  const panel = useUi((value) => value.panel);
  const terminal = useUi((value) => value.terminal);
  const tabs = tabsOf(state, workspace, ui.extraTabs);
  const active =
    tabs.find((entry) => entry.key === ui.activeKey) ??
    tabs.find((entry) => entry.tab.kind === 'chat') ??
    tabs[0];
  const activeTab = active?.tab;
  const session =
    activeTab?.kind === 'chat'
      ? workspace.sessions.find((item) => item.id === activeTab.sessionId)
      : null;
  const extraBrowsers = ui.extraTabs.flatMap((tab) =>
    tab.kind === 'browser' ? [tab] : [],
  );
  const lastChatKey = tabs.findLast((entry) => entry.tab.kind === 'chat')?.key;

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <WorkspaceHeader state={state} workspace={workspace} />
      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col bg-app">
          <TabStrip
            state={state}
            workspace={workspace}
            tabs={tabs}
            activeKey={active?.key ?? ''}
          />
          {session ? (
            <ChatView
              key={session.id}
              state={state}
              workspace={workspace}
              session={session}
            />
          ) : null}
          {activeTab?.kind === 'diff' ? (
            <DiffView
              key={activeTab.range?.to ?? 'live'}
              state={state}
              workspace={workspace}
              focusFile={activeTab.file}
              range={activeTab.range ?? null}
              onSendComments={() => {
                const key =
                  ui.extraTabs.length && lastChatKey ? lastChatKey : null;
                if (key) activateTab(workspace.id, key);
                requestAnimationFrame(focusComposer);
              }}
            />
          ) : null}
          {activeTab?.kind === 'file' ? (
            <FileView
              key={activeTab.file}
              workspace={workspace}
              file={activeTab.file}
              line={activeTab.line ?? null}
              editing={activeTab.editing ?? false}
            />
          ) : null}
          {activeTab?.kind === 'search' ? (
            <SearchView workspace={workspace} />
          ) : null}
          {activeTab?.kind === 'comments' ? (
            <PrComments state={state} workspace={workspace} wide />
          ) : null}
          {activeTab?.kind === 'terminal' ? (
            <XTerm
              key={activeTab.id}
              workspaceId={workspace.id}
              terminalRef={terminalTabRef(workspace.id, activeTab.id)}
              kind="shell"
              preset={activeTab.preset}
              interactive
            />
          ) : null}
          {extraBrowsers.map((tab) => (
            <div
              key={tab.id}
              className={cn(
                'min-h-0 flex-1 flex-col',
                activeTab === tab ? 'flex' : 'hidden',
              )}
            >
              <BrowserView url={tab.url} />
            </div>
          ))}
        </main>
        {panel ? (
          <aside
            aria-label="Workspace panel"
            className="flex w-panel flex-none flex-col border-l border-border-1 bg-surface"
          >
            <GitPanel state={state} workspace={workspace} />
            {terminal ? (
              <TerminalPanel state={state} workspace={workspace} />
            ) : (
              <CollapsedTerminalBar />
            )}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
