import { FitAddon } from '@xterm/addon-fit';
import { Terminal, type ITheme } from '@xterm/xterm';
import { useEffect, useRef } from 'react';
import type { TerminalKind, TerminalPreset } from '../shared/model';
import { api, on } from './bridge';
import { reportFailure } from './ui/toast';

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

export interface XTermProps {
  workspaceId: string;
  terminalRef: string;
  kind: TerminalKind;
  interactive: boolean;
  preset?: TerminalPreset;
}

export function XTerm({
  workspaceId,
  terminalRef: ref,
  kind,
  interactive,
  preset,
}: XTermProps) {
  const host = useRef<HTMLDivElement>(null);
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
      .openTerminal(
        ref,
        workspaceId,
        kind,
        { cols: terminal.cols, rows: terminal.rows },
        preset,
      )
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
  }, [ref, workspaceId, kind, interactive, preset]);
  return <div ref={host} className="min-h-0 flex-1 bg-inset py-1 pl-2" />;
}
