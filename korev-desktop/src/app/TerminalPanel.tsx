import { FitAddon } from '@xterm/addon-fit';
import { Terminal, type ITheme } from '@xterm/xterm';
import { useEffect, useRef, useState } from 'react';
import { Button, cn, Icon, IconButton, Tabs } from '../design-system';
import type { AppState, TerminalKind, Workspace } from '../shared/model';
import { openSettings, toggleRunScript } from './actions';
import { api, on } from './bridge';
import { reportFailure } from './ui/toast';
import {
  EMPTY_WORKSPACE_UI,
  setUi,
  updateWorkspaceUi,
  useUi,
} from './ui-store';

const FONT_SIZE = 12;

function token(styles: CSSStyleDeclaration, name: string): string {
  return styles.getPropertyValue(name).trim();
}

function themeFromTokens(): { theme: ITheme; fontFamily: string } {
  const styles = getComputedStyle(document.documentElement);
  return {
    theme: {
      background: token(styles, '--bg-inset'),
      foreground: token(styles, '--fg-1'),
      cursor: token(styles, '--accent'),
      selectionBackground: token(styles, '--selection-bg'),
    },
    fontFamily: token(styles, '--font-mono'),
  };
}

function XTerm({
  workspaceId,
  kind,
  interactive,
}: {
  workspaceId: string;
  kind: TerminalKind;
  interactive: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const ref = `${workspaceId}:${kind}`;
  useEffect(() => {
    const element = host.current;
    if (!element) return undefined;
    const terminal = new Terminal({
      ...themeFromTokens(),
      fontSize: FONT_SIZE,
      cursorBlink: interactive,
      disableStdin: !interactive,
      convertEol: !interactive,
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(element);
    fit.fit();
    let replayed = false;
    const buffered: string[] = [];
    const stopOutput = on('terminal-output', (output) => {
      if (output.ref !== ref) return;
      if (replayed) terminal.write(output.data);
      else buffered.push(output.data);
    });
    const stopExit = on('terminal-exit', (exit) => {
      if (exit.ref !== ref) return;
      const message =
        exit.exitCode === -1
          ? 'Stopped'
          : `Process exited with code ${exit.exitCode}`;
      terminal.write(`\r\n\x1b[2m[${message}]\x1b[0m\r\n`);
    });
    const input = terminal.onData((data) => void api.writeTerminal(ref, data));
    const resizer = new ResizeObserver(() => {
      if (!element.clientWidth) return;
      fit.fit();
      void api.resizeTerminal(ref, {
        cols: terminal.cols,
        rows: terminal.rows,
      });
    });
    resizer.observe(element);
    let attached = true;
    void api
      .openTerminal(ref, workspaceId, kind, {
        cols: terminal.cols,
        rows: terminal.rows,
      })
      .then((result) => {
        if (!attached || !reportFailure(result)) return;
        terminal.write(result.value);
        buffered.forEach((data) => terminal.write(data));
        replayed = true;
      });
    return () => {
      attached = false;
      stopOutput();
      stopExit();
      input.dispose();
      resizer.disconnect();
      terminal.dispose();
    };
  }, [ref, workspaceId, kind, interactive]);
  return <div ref={host} className="min-h-0 flex-1 bg-inset py-1 pl-2" />;
}

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
          <Button
            size="sm"
            variant={runRunning ? 'danger' : 'secondary'}
            icon={runRunning ? 'square' : 'play'}
            title="⌘R"
            onClick={() => void toggleRunScript(state, workspace)}
          >
            {runRunning ? 'Stop' : 'Run'}
          </Button>
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
