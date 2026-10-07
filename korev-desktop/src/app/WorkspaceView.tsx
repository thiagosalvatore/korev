import { Button, cn, Icon, IconButton } from '../design-system';
import {
  AGENT_KINDS,
  AGENT_LABELS,
  hasWorktree,
  type AppState,
  type Workspace,
  type WorkspaceRuntime,
} from '../shared/model';
import {
  activateTab,
  archiveWorkspace,
  closeTab,
  focusComposer,
  newChat,
} from './actions';
import { ChatView } from './chat/ChatView';
import { DiffView } from './diff/DiffView';
import { FileView } from './FileView';
import { SearchView } from './SearchView';
import { fileName } from './format';
import { DRAG_REGION } from './layout';
import { GitPanel } from './GitPanel';
import { CollapsedTerminalBar, TerminalPanel } from './TerminalPanel';
import { Menu } from './ui/Menu';
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
} as const;

function extraTabLabel(tab: MainTab): string {
  if (tab.kind === 'diff') return tab.range ? 'Turn changes' : 'Changes';
  if (tab.kind === 'file') return fileName(tab.file);
  if (tab.kind === 'search') return 'Search';
  return '';
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
    <div
      role="tablist"
      aria-label="Tabs"
      className="flex h-9 flex-none items-stretch overflow-x-auto border-b border-border-1 bg-surface"
    >
      {tabs.map((entry) => {
        const selected = entry.key === activeKey;
        const session =
          entry.tab.kind === 'chat'
            ? workspace.sessions.find(
                (item) =>
                  entry.tab.kind === 'chat' && item.id === entry.tab.sessionId,
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
                    : TAB_ICONS[entry.tab.kind as 'diff' | 'file' | 'search']
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
      <div className="flex items-center px-1">
        <Menu
          label="New tab"
          items={AGENT_KINDS.map((agent) => ({
            id: agent,
            label: `New ${AGENT_LABELS[agent]} chat`,
            icon: agent === 'claude' ? 'sparkle' : 'hexagon',
            hint: agent === state.settings.defaultAgent ? '⌘T' : undefined,
            onSelect: () => void newChat(workspace, agent),
          }))}
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

function WorkspaceWithoutWorktree({
  state,
  workspace,
  runtime,
}: {
  state: AppState;
  workspace: Workspace;
  runtime: WorkspaceRuntime;
}) {
  const failed = runtime.status === 'failed';
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-app">
      <div className={cn('h-11 flex-none', DRAG_REGION)} />
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
          {failed ? runtime.message : `Creating ${workspace.name}`}
        </p>
        {failed ? null : (
          <p className="m-0 text-sm text-fg-3">
            Fetching origin/{workspace.baseBranch} and adding a worktree. You
            can keep working elsewhere.
          </p>
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
            onClick={() => void archiveWorkspace(state, workspace)}
          >
            Archive workspace
          </Button>
        ) : null}
      </div>
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
