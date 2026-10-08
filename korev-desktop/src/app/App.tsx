import { useEffect } from 'react';
import { cn, Logo, Spinner } from '../design-system';
import type { AppState } from '../shared/model';
import { activeWorkspaces } from '../shared/workspaces';
import { openNewWorkspace, selectWorkspace } from './actions';
import { AskPage } from './AskPage';
import { api } from './bridge';
import { CommandPalette } from './CommandPalette';
import { paneCount } from './grid';
import { GridView } from './GridView';
import { useAppState, useMediaQuery } from './hooks';
import { DRAG_REGION } from './layout';
import { NewWorkspacePage } from './NewWorkspacePage';
import { QuitDialog, QuitPending } from './QuitDialog';
import { ReleaseNotesDialog } from './ReleaseNotesDialog';
import { SettingsPage } from './SettingsPage';
import { Sidebar } from './Sidebar';
import { Toaster } from './ui/toast';
import { useUi, type UiState } from './ui-store';
import { useCommands } from './useCommands';
import { Welcome } from './Welcome';
import { WorkspaceView } from './WorkspaceView';

const LIGHT_SCHEME_QUERY = '(prefers-color-scheme: light)';

function useTheme(state: AppState | null) {
  const systemLight = useMediaQuery(LIGHT_SCHEME_QUERY);
  const preference = state?.settings.theme ?? 'system';
  const light =
    preference === 'light' || (preference === 'system' && systemLight);
  useEffect(() => {
    document.documentElement.dataset.theme = light ? 'light' : 'dark';
  }, [light]);
}

function visibleWorkspaceIds(ui: UiState): string {
  if (ui.page.kind === 'workspace') return ui.workspaceId ?? '';
  if (ui.page.kind !== 'grid') return '';
  return ui.grid.panes
    .slice(0, paneCount(ui.grid.layout))
    .flatMap((pane) => (pane ? [pane.workspaceId] : []))
    .join(',');
}

function Shell({ state }: { state: AppState }) {
  const page = useUi((ui) => ui.page);
  const workspaceId = useUi((ui) => ui.workspaceId);
  const sidebar = useUi((ui) => ui.sidebar);
  const visibleIds = useUi(visibleWorkspaceIds);
  const workspace = state.workspaces.find((ws) => ws.id === workspaceId);
  const fallback = activeWorkspaces(state)[0];

  useEffect(() => {
    if (page.kind !== 'workspace' || workspace) return;
    if (fallback) selectWorkspace(fallback.id);
    else openNewWorkspace(null);
  }, [page.kind, workspace, fallback]);

  useEffect(() => {
    void api.focusWorkspaces(visibleIds ? visibleIds.split(',') : []);
  }, [visibleIds]);

  return (
    <div className="flex h-screen overflow-hidden bg-app text-fg-1">
      {sidebar ? <Sidebar state={state} /> : null}
      {page.kind === 'settings' ? (
        <SettingsPage state={state} section={page.section} />
      ) : null}
      {page.kind === 'new-workspace' ? (
        <NewWorkspacePage
          key={page.repoId ?? 'any'}
          state={state}
          repoId={page.repoId}
        />
      ) : null}
      {page.kind === 'ask' ? (
        <AskPage
          key={page.askChatId ?? `new:${page.repoIds.join(',')}`}
          state={state}
          askChatId={page.askChatId}
          repoIds={page.repoIds}
        />
      ) : null}
      {page.kind === 'grid' ? <GridView state={state} /> : null}
      {page.kind === 'workspace' && workspace ? (
        <WorkspaceView key={workspace.id} state={state} workspace={workspace} />
      ) : null}
      <CommandPalette state={state} />
    </div>
  );
}

function Loading() {
  return (
    <div className="flex h-screen flex-col bg-app">
      <div className={cn('h-11 flex-none', DRAG_REGION)} />
      <div className="flex flex-1 flex-col items-center justify-center gap-6 pb-20">
        <Logo size={36} />
        <div className="flex h-6">
          <Spinner />
        </div>
      </div>
    </div>
  );
}

export function App() {
  const state = useAppState();
  useTheme(state);
  useCommands(state);
  if (!state) return <Loading />;
  return (
    <>
      {state.repos.length ? <Shell state={state} /> : <Welcome state={state} />}
      <ReleaseNotesDialog state={state} />
      <QuitDialog state={state} />
      <Toaster>
        <QuitPending state={state} />
      </Toaster>
    </>
  );
}
