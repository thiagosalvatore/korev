import { useEffect, useState } from 'react';
import { XTerm } from './XTerm';
import { Button, cn, Icon, IconButton, Tabs } from '../design-system';
import type {
  AppState,
  RepoConfig,
  TerminalKind,
  Workspace,
} from '../shared/model';
import {
  openBrowser,
  openSettings,
  startRunScript,
  toggleRunScript,
} from './actions';
import { Menu } from './ui/Menu';
import { api } from './bridge';
import { reportFailure, toast } from './ui/toast';
import {
  EMPTY_WORKSPACE_UI,
  setUi,
  updateWorkspaceUi,
  useUi,
} from './ui-store';

const TABS: { id: TerminalKind; label: string }[] = [
  { id: 'setup', label: 'Setup' },
  { id: 'run', label: 'Run' },
  { id: 'shell', label: 'Terminal' },
];

function ScriptEmptyState({
  workspace,
  kind,
}: {
  workspace: Workspace;
  kind: 'setup' | 'run';
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-inset text-center text-fg-3">
      <p className="m-0 text-sm">
        {kind === 'setup'
          ? 'No setup script ran in this workspace.'
          : 'Nothing running.'}
      </p>
      <div className="flex gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          icon="plus"
          onClick={() => openSettings(`repo:${workspace.repoId}`)}
        >
          {kind === 'setup' ? 'Add setup script' : 'Add run script'}
        </Button>
      </div>
    </div>
  );
}

function useWorkspaceConfig(workspace: Workspace) {
  const [config, setConfig] = useState<RepoConfig | null>(null);
  useEffect(() => {
    if (workspace.archivedAt) return;
    void api
      .workspaceConfig(workspace.id)
      .then(setConfig)
      .catch(() => setConfig(null));
  }, [workspace.id, workspace.archivedAt]);
  return config;
}

function OpenButton({
  state,
  workspace,
  config,
}: {
  state: AppState;
  workspace: Workspace;
  config: RepoConfig | null;
}) {
  const runUrl = state.runtime[workspace.id]?.runUrl ?? null;
  const previews = [
    ...(config?.previewUrls ?? []),
    ...(runUrl && !config?.previewUrls.some((preview) => preview.url === runUrl)
      ? [{ name: 'Detected', url: runUrl }]
      : []),
  ];
  const [first] = previews;
  if (!first) return null;
  return (
    <div className="flex items-center">
      <Button
        size="sm"
        variant="secondary"
        icon="external-link"
        className="rounded-r-none"
        title={first.url}
        onClick={() => void api.openExternal(first.url)}
      >
        Open
      </Button>
      {previews.length > 0 ? (
        <Menu
          label="Preview URLs"
          align="right"
          items={previews.flatMap((preview) => [
            {
              id: preview.url,
              label: `${preview.name} · ${preview.url}`,
              icon: 'external-link' as const,
              onSelect: () => void api.openExternal(preview.url),
            },
            {
              id: `${preview.url}:korev`,
              label: `Open ${preview.name} in Korev`,
              icon: 'globe' as const,
              onSelect: () => openBrowser(workspace.id, preview.url),
            },
          ])}
          trigger={({ toggle }) => (
            <Button
              size="sm"
              variant="secondary"
              className="-ml-px rounded-l-none px-1.5"
              aria-label="More preview URLs"
              onClick={toggle}
            >
              <Icon name="chevron-down" size={13} />
            </Button>
          )}
        />
      ) : null}
    </div>
  );
}

function SpotlightButton({
  state,
  workspace,
  config,
}: {
  state: AppState;
  workspace: Workspace;
  config: RepoConfig | null;
}) {
  const repo = state.repos.find((entry) => entry.id === workspace.repoId);
  if (!repo || (!repo.spotlightTesting && !config?.spotlightTesting))
    return null;
  const active = state.spotlights[repo.id] === workspace.id;
  return (
    <Button
      size="sm"
      variant={active ? 'primary' : 'secondary'}
      icon="scan-eye"
      title={`Mirror this workspace's tracked changes into ${repo.path} so the app you run from there picks them up`}
      onClick={async () => {
        const result = await api.toggleSpotlight(workspace.id);
        if (reportFailure(result))
          toast(
            active
              ? `Spotlight off, ${repo.name} restored`
              : `Spotlight on for ${workspace.name}`,
          );
      }}
    >
      Spotlight
    </Button>
  );
}

function RunControls({
  state,
  workspace,
}: {
  state: AppState;
  workspace: Workspace;
}) {
  const config = useWorkspaceConfig(workspace);
  const selectedId = useUi(
    (ui) => ui.workspaces[workspace.id]?.runScriptId ?? null,
  );
  const running = state.runningTerminals.includes(`${workspace.id}:run`);
  const scripts = config?.runScripts ?? [];
  const selected =
    scripts.find((script) => script.id === selectedId) ??
    scripts.find((script) => script.isDefault);
  return (
    <div className="flex items-center gap-1.5">
      <SpotlightButton state={state} workspace={workspace} config={config} />
      <OpenButton state={state} workspace={workspace} config={config} />
      <div className="flex items-center">
        <Button
          size="sm"
          variant={running ? 'danger' : 'secondary'}
          icon={running ? 'square' : 'play'}
          title={selected ? `${selected.command} (⌘R)` : '⌘R'}
          className={scripts.length > 1 ? 'rounded-r-none' : ''}
          onClick={() => toggleRunScript(state, workspace)}
        >
          {running
            ? 'Stop'
            : scripts.length > 1 && selected
              ? `Run ${selected.id}`
              : 'Run'}
        </Button>
        {scripts.length > 1 ? (
          <Menu
            label="Run scripts"
            align="right"
            items={scripts.map((script) => ({
              id: script.id,
              label: script.id.replace(/-/g, ' '),
              hint: script.isDefault ? 'default' : undefined,
              checked: script.id === selected?.id,
              onSelect: () => void startRunScript(workspace, script.id),
            }))}
            trigger={({ toggle }) => (
              <Button
                size="sm"
                variant={running ? 'danger' : 'secondary'}
                className="-ml-px rounded-l-none px-1.5"
                aria-label="Choose run script"
                onClick={toggle}
              >
                <Icon name="chevron-down" size={13} />
              </Button>
            )}
          />
        ) : null}
      </div>
    </div>
  );
}

export function TerminalPanel({
  state,
  workspace,
}: {
  state: AppState;
  workspace: Workspace;
}) {
  const tab = useUi(
    (ui) => (ui.workspaces[workspace.id] ?? EMPTY_WORKSPACE_UI).terminalTab,
  );
  const [shellKey, setShellKey] = useState(0);
  const ref = `${workspace.id}:${tab}`;
  const running = state.runningTerminals.includes(ref);
  const runRunning = state.runningTerminals.includes(`${workspace.id}:run`);
  const setupRunning = state.runningTerminals.includes(`${workspace.id}:setup`);
  const [known, setKnown] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (running)
      setKnown((current) =>
        current.has(ref) ? current : new Set(current).add(ref),
      );
  }, [running, ref]);

  const showScriptEmpty = tab !== 'shell' && !running && !known.has(ref);
  return (
    <section
      aria-label="Terminal"
      className="flex h-[42%] min-h-40 flex-none flex-col border-t border-border-1"
    >
      <div className="flex flex-none items-center pr-1.5">
        <Tabs
          className="flex-1 border-b-0 px-1.5"
          tabs={TABS.map((entry) => ({
            ...entry,
            icon:
              (entry.id === 'run' && runRunning) ||
              (entry.id === 'setup' && setupRunning)
                ? ('loader-circle' as const)
                : undefined,
          }))}
          value={tab}
          onChange={(id) =>
            updateWorkspaceUi(workspace.id, () => ({
              terminalTab: id as TerminalKind,
            }))
          }
        />
        {tab === 'run' ? (
          <RunControls state={state} workspace={workspace} />
        ) : null}
        {tab === 'setup' ? (
          <Button
            size="sm"
            variant="ghost"
            icon="rotate-ccw"
            onClick={async () => {
              if (reportFailure(await api.startScript(workspace.id, 'setup')))
                setKnown((current) => new Set(current).add(ref));
            }}
          >
            Rerun setup
          </Button>
        ) : null}
        {tab === 'shell' ? (
          <IconButton
            icon="rotate-ccw"
            label="Restart terminal"
            size="sm"
            onClick={async () => {
              await api.closeTerminal(ref);
              setShellKey((value) => value + 1);
            }}
          />
        ) : null}
        <IconButton
          icon="chevron-down"
          label="Hide terminal"
          size="sm"
          onClick={() => setUi({ terminal: false })}
        />
      </div>
      <div className={cn('flex min-h-0 flex-1 flex-col')}>
        {workspace.archivedAt ? (
          <p className="m-0 p-4 text-sm text-fg-3">Archived workspace.</p>
        ) : showScriptEmpty ? (
          <ScriptEmptyState
            workspace={workspace}
            kind={tab as 'setup' | 'run'}
          />
        ) : (
          <XTerm
            key={`${ref}:${shellKey}:${tab === 'shell' || running}`}
            workspaceId={workspace.id}
            terminalRef={ref}
            kind={tab}
            interactive={tab === 'shell'}
          />
        )}
      </div>
    </section>
  );
}

export function CollapsedTerminalBar() {
  return (
    <button
      type="button"
      className="flex h-8 flex-none cursor-pointer items-center gap-2 border-0 border-t border-border-1 bg-transparent px-3 text-xs text-fg-3 hover:text-fg-1"
      onClick={() => setUi({ terminal: true })}
    >
      <Icon name="square-terminal" size={13} />
      Terminal
      <span className="flex-1" />
      <span className="font-mono text-2xs text-fg-4">⌘J</span>
    </button>
  );
}
