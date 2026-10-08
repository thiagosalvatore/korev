import { useEffect } from 'react';
import { Button, cn, Icon, IconButton, type IconName } from '../design-system';
import {
  hasWorktree,
  type AgentKind,
  type AppState,
  type Workspace,
} from '../shared/model';
import { activeWorkspaces } from '../shared/workspaces';
import {
  chatPane,
  clearPane,
  expandPane,
  fillPane,
  focusComposer,
  focusPane,
  newChatInPane,
  setGridLayout,
  showInPane,
} from './actions';
import { ChatView } from './chat/ChatView';
import { useDropTarget, WORKSPACE_DRAG_TYPE } from './dnd';
import { GRID_LAYOUTS, resolvePane, type PaneContent } from './grid';
import { DRAG_REGION, NO_DRAG, TRAFFIC_LIGHT_GUTTER } from './layout';
import { Menu, type MenuItem } from './ui/Menu';
import {
  getUi,
  setUi,
  useUi,
  type GridLayout,
  type GridPane,
} from './ui-store';
import { WorktreePending } from './WorkspaceView';

const LAYOUT_ICONS: Record<GridLayout, IconName> = {
  '2x1': 'columns-2',
  '1x2': 'rows-2',
  '2x2': 'grid-2x2',
};

const AGENT_ICONS: Record<AgentKind, IconName> = {
  claude: 'sparkle',
  codex: 'hexagon',
};

function LayoutPicker({ layout }: { layout: GridLayout }) {
  const items = (Object.keys(GRID_LAYOUTS) as GridLayout[]).map(
    (option): MenuItem => ({
      id: option,
      label: option,
      icon: LAYOUT_ICONS[option],
      checked: option === layout,
      onSelect: () => setGridLayout(option),
    }),
  );
  return (
    <div className={NO_DRAG}>
      <Menu
        label="Layout"
        align="right"
        items={items}
        trigger={({ toggle }) => (
          <Button
            size="sm"
            variant="ghost"
            icon={LAYOUT_ICONS[layout]}
            iconRight="chevron-down"
            onClick={toggle}
          >
            {layout}
          </Button>
        )}
      />
    </div>
  );
}

function paneTabItems(
  state: AppState,
  index: number,
  content: PaneContent,
): MenuItem[] {
  const { workspace } = content;
  const chats = workspace.sessions.map((session): MenuItem => {
    const pane = chatPane(workspace.id, session.id);
    return {
      id: pane.tabKey,
      label: session.title,
      icon: AGENT_ICONS[session.agent],
      checked: session.id === content.session.id,
      section: 'Chats',
      onSelect: () => showInPane(index, pane),
    };
  });
  return [
    ...chats,
    {
      id: 'new-chat',
      label: 'New chat',
      icon: 'message-square-plus',
      hint: '⌘T',
      section: 'New',
      onSelect: () =>
        void newChatInPane(index, workspace, state.settings.defaultAgent),
    },
  ];
}

function PaneHeader({
  state,
  index,
  pane,
  content,
}: {
  state: AppState;
  index: number;
  pane: GridPane;
  content: PaneContent;
}) {
  const { workspace, session } = content;
  const running = state.runningSessions.includes(session.id);
  return (
    <div className="flex h-9 flex-none items-center gap-2 border-b border-border-1 bg-surface pr-1 pl-3 text-sm">
      {running ? (
        <Icon
          name="loader-circle"
          size={13}
          className="animate-spin text-accent-text"
        />
      ) : (
        <Icon
          name={AGENT_ICONS[session.agent]}
          size={13}
          className="text-fg-3"
        />
      )}
      <span
        className="min-w-0 truncate font-medium text-fg-1"
        title={workspace.branch}
      >
        {workspace.branch}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-fg-3">
        {workspace.name}
      </span>
      <Menu
        label={`${workspace.name} tabs`}
        align="right"
        items={paneTabItems(state, index, content)}
        trigger={({ toggle }) => (
          <Button
            size="sm"
            variant="ghost"
            iconRight="chevron-down"
            className="min-w-0 max-w-48"
            onClick={toggle}
          >
            <span className="truncate">{session.title}</span>
          </Button>
        )}
      />
      <IconButton
        icon="maximize-2"
        label="Open in full view"
        size="sm"
        onClick={() => expandPane(pane)}
      />
      <IconButton
        icon="x"
        label="Remove from grid"
        size="sm"
        onClick={() => clearPane(index)}
      />
    </div>
  );
}

function PaneBody({
  state,
  content,
}: {
  state: AppState;
  content: PaneContent;
}) {
  const { workspace, session } = content;
  const runtime = state.runtime[workspace.id];
  if (runtime && !hasWorktree(runtime))
    return (
      <WorktreePending state={state} workspace={workspace} runtime={runtime} />
    );
  return (
    <ChatView
      key={session.id}
      state={state}
      workspace={workspace}
      session={session}
      autoFocus={false}
    />
  );
}

function repoName(state: AppState, workspace: Workspace): string {
  return state.repos.find((repo) => repo.id === workspace.repoId)?.name ?? '';
}

function EmptyPane({ state, index }: { state: AppState; index: number }) {
  const workspaces = activeWorkspaces(state);
  const items = workspaces.map(
    (workspace): MenuItem => ({
      id: workspace.id,
      label: workspace.name,
      section: repoName(state, workspace),
      onSelect: () => fillPane(index, workspace),
    }),
  );
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <Icon name="layout-grid" size={22} className="text-fg-4" />
      <p className="m-0 text-sm text-fg-3">
        Drag a workspace here from the sidebar.
      </p>
      <Menu
        label="Choose workspace"
        items={items}
        trigger={({ toggle }) => (
          <Button
            size="sm"
            icon="plus"
            disabled={!workspaces.length}
            onClick={toggle}
          >
            Choose workspace
          </Button>
        )}
      />
    </div>
  );
}

function Pane({
  state,
  index,
  pane,
  focused,
}: {
  state: AppState;
  index: number;
  pane: GridPane | null;
  focused: boolean;
}) {
  const content = resolvePane(state, pane);
  const drop = useDropTarget({
    [WORKSPACE_DRAG_TYPE]: (workspaceId) => {
      const workspace = activeWorkspaces(state).find(
        (entry) => entry.id === workspaceId,
      );
      if (workspace) fillPane(index, workspace);
    },
  });
  const focus = () => {
    if (!focused) focusPane(index);
  };
  return (
    <section
      aria-label={`Pane ${index + 1}`}
      data-grid-focused={focused || undefined}
      className="relative flex min-h-0 min-w-0 flex-col bg-app"
      onMouseDown={focus}
      onFocusCapture={focus}
      {...drop.props}
    >
      {pane && content ? (
        <>
          <PaneHeader
            state={state}
            index={index}
            pane={pane}
            content={content}
          />
          <PaneBody state={state} content={content} />
        </>
      ) : (
        <EmptyPane state={state} index={index} />
      )}
      <div
        className={cn(
          'pointer-events-none absolute inset-0 border-accent',
          drop.over ? 'border-2' : focused && 'border',
        )}
      />
    </section>
  );
}

export function GridView({ state }: { state: AppState }) {
  const grid = useUi((ui) => ui.grid);
  const sidebar = useUi((ui) => ui.sidebar);
  const { cols, rows } = GRID_LAYOUTS[grid.layout];

  useEffect(() => {
    focusPane(getUi().grid.focused);
    requestAnimationFrame(focusComposer);
  }, []);

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-app">
      <header
        className={cn(
          'flex h-11 flex-none items-center gap-2 border-b border-border-1 bg-app pr-2',
          DRAG_REGION,
          sidebar ? 'pl-3' : TRAFFIC_LIGHT_GUTTER,
        )}
      >
        {sidebar ? null : (
          <IconButton
            icon="panel-left"
            label="Show sidebar"
            size="sm"
            className={NO_DRAG}
            onClick={() => setUi({ sidebar: true })}
          />
        )}
        <span className="flex-1 text-sm font-semibold text-fg-1">Grid</span>
        <LayoutPicker layout={grid.layout} />
      </header>
      <div
        className="grid min-h-0 flex-1 gap-px bg-border-1"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        }}
      >
        {grid.panes.slice(0, cols * rows).map((pane, index) => (
          <Pane
            key={index}
            state={state}
            index={index}
            pane={pane}
            focused={index === grid.focused}
          />
        ))}
      </div>
    </div>
  );
}
