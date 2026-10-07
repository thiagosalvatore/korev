import { cn, Icon, IconButton } from '../design-system';
import {
  AGENT_KINDS,
  AGENT_LABELS,
  type AppState,
  type Workspace,
} from '../shared/model';
import { activateTab, closeTab, focusComposer, newChat } from './actions';
import { ChatView } from './chat/ChatView';
import { DiffView } from './DiffView';
import { FileView } from './FileView';
import { fileName } from './format';
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
    label:
      tab.kind === 'diff'
        ? 'Changes'
        : tab.kind === 'file'
          ? fileName(tab.file)
          : '',
    running: false,
    closable: true,
  }));
  return [...chats, ...others];
}

const TAB_ICONS = { diff: 'git-compare', file: 'file' } as const;

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
                    : TAB_ICONS[entry.tab.kind as 'diff' | 'file']
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

export function WorkspaceView({
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
              workspace={workspace}
              focusFile={activeTab.file}
              onSendComments={() => {
                const key =
                  ui.extraTabs.length && lastChatKey ? lastChatKey : null;
                if (key) activateTab(workspace.id, key);
                requestAnimationFrame(focusComposer);
              }}
            />
          ) : null}
          {activeTab?.kind === 'file' ? (
            <FileView workspace={workspace} file={activeTab.file} />
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
