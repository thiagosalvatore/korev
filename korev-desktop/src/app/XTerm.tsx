import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { Terminal } from '@xterm/xterm';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { TerminalKind, TerminalPreset } from '../shared/model';
import { api, on } from './bridge';
import { isShortcut } from './keyboard';
import { TerminalFind } from './TerminalFind';
import { themeFromTokens } from './terminal-theme';
import { reportFailure } from './ui/toast';

const FONT_SIZE = 12;
const FIND_KEY = 'f';

interface MountedTerminal {
  terminal: Terminal;
  search: SearchAddon;
}

export interface XTermProps {
  workspaceId: string;
  terminalRef: string;
  kind: TerminalKind;
  interactive: boolean;
  preset?: TerminalPreset;
  initialInput?: string;
}

export function XTerm({
  workspaceId,
  terminalRef: ref,
  kind,
  interactive,
  preset,
  initialInput,
}: XTermProps) {
  const host = useRef<HTMLDivElement>(null);
  const findInput = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState<MountedTerminal | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  useEffect(() => {
    const element = host.current;
    if (!element) return undefined;
    const terminal = new Terminal({
      ...themeFromTokens(),
      fontSize: FONT_SIZE,
      cursorBlink: interactive,
      disableStdin: !interactive,
      convertEol: !interactive,
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    const search = new SearchAddon();
    terminal.loadAddon(fit);
    terminal.loadAddon(search);
    terminal.open(element);
    fit.fit();
    setMounted({ terminal, search });
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
    let forwardInput = false;
    const input = terminal.onData((data) => {
      if (forwardInput) void api.writeTerminal(ref, data);
    });
    const resizer = new ResizeObserver(() => {
      if (!element.clientWidth) return;
      fit.fit();
      void api.resizeTerminal(ref, {
        cols: terminal.cols,
        rows: terminal.rows,
      });
    });
    resizer.observe(element);
    const retheme = new MutationObserver(() => {
      terminal.options.theme = themeFromTokens().theme;
    });
    retheme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-palette', 'style'],
    });
    let attached = true;
    void api
      .openTerminal(
        ref,
        workspaceId,
        kind,
        { cols: terminal.cols, rows: terminal.rows },
        preset,
        initialInput,
      )
      .then((result) => {
        if (!attached || !reportFailure(result)) return;
        terminal.write(result.value, () => {
          forwardInput = true;
        });
        buffered.forEach((data) => terminal.write(data));
        replayed = true;
      });
    return () => {
      attached = false;
      stopOutput();
      stopExit();
      input.dispose();
      resizer.disconnect();
      retheme.disconnect();
      setMounted(null);
      setFindOpen(false);
      terminal.dispose();
    };
  }, [ref, workspaceId, kind, interactive, preset, initialInput]);

  const openFindOnShortcut = (event: KeyboardEvent) => {
    if (!isShortcut(event, FIND_KEY)) return;
    event.preventDefault();
    setFindOpen(true);
    findInput.current?.select();
  };

  const closeFind = () => {
    setFindOpen(false);
    mounted?.search.clearDecorations();
    mounted?.terminal.focus();
  };

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onKeyDown={openFindOnShortcut}
    >
      <div ref={host} className="min-h-0 flex-1 bg-inset py-1 pl-2" />
      {findOpen && mounted ? (
        <TerminalFind
          search={mounted.search}
          inputRef={findInput}
          onClose={closeFind}
        />
      ) : null}
    </div>
  );
}
