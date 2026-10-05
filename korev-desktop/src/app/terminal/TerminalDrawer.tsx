import { FitAddon } from '@xterm/addon-fit';
import { Terminal, type ITheme } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../design-system';
import type { PrTarget } from '../../shared/merge';
import { prRef } from '../../shared/pr-ref';
import type { TerminalOutput } from '../../shared/terminal';
import { korev } from '../bridge';

const FONT_SIZE = 12;

function token(styles: CSSStyleDeclaration, name: string): string {
  return styles.getPropertyValue(name).trim();
}

function themeFromTokens(): { theme: ITheme; fontFamily: string } {
  const styles = getComputedStyle(document.documentElement);
  return {
    theme: {
      background: token(styles, '--color-inset'),
      foreground: token(styles, '--color-fg-1'),
      cursor: token(styles, '--color-accent'),
    },
    fontFamily: token(styles, '--font-mono'),
  };
}

function sizeOf(terminal: Terminal) {
  return { cols: terminal.cols, rows: terminal.rows };
}

function attach(
  element: HTMLElement,
  target: PrTarget,
  onProblem: (message: string) => void,
): () => void {
  const bridge = korev().terminal;
  const ref = prRef(target);
  const terminal = new Terminal({
    ...themeFromTokens(),
    fontSize: FONT_SIZE,
    cursorBlink: true,
  });
  const fit = new FitAddon();
  terminal.loadAddon(fit);
  terminal.open(element);
  fit.fit();

  let replayed = false;
  const stopOutput = bridge.onOutput((output: TerminalOutput) => {
    if (replayed && output.ref === ref) terminal.write(output.data);
  });
  const input = terminal.onData((data) => void bridge.write(target, data));
  const resizer = new ResizeObserver(() => {
    fit.fit();
    void bridge.resize(target, sizeOf(terminal));
  });
  resizer.observe(element);

  let attached = true;
  void bridge.open(target, sizeOf(terminal)).then((result) => {
    if (!attached) return;
    if (!result.ok) {
      onProblem(result.message);
      return;
    }
    terminal.write(result.scrollback);
    replayed = true;
    terminal.focus();
  });

  return () => {
    attached = false;
    stopOutput();
    input.dispose();
    resizer.disconnect();
    terminal.dispose();
  };
}

function TerminalPane({ target }: { target: PrTarget }) {
  const host = useRef<HTMLDivElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const { repo, number, id } = target;

  useEffect(() => {
    if (!host.current) return undefined;
    return attach(host.current, { id, repo, number }, setProblem);
  }, [id, repo, number]);

  if (problem) {
    return <p className="m-0 p-4 text-sm text-danger-text">{problem}</p>;
  }
  return <div ref={host} className="min-h-0 flex-1 bg-inset p-2" />;
}

export interface TerminalDrawerProps {
  target: PrTarget;
  onHide: () => void;
}

export function TerminalDrawer({ target, onHide }: TerminalDrawerProps) {
  const ref = prRef(target);

  useEffect(
    () =>
      korev().terminal.onExit((exit) => {
        if (exit.ref === ref) onHide();
      }),
    [ref, onHide],
  );

  return (
    <section
      aria-label={`Terminal for ${ref}`}
      className="flex h-2/5 min-h-40 shrink-0 flex-col border-t border-border-1 bg-surface"
    >
      <div className="flex items-center gap-2 px-4 py-1.5">
        <p className="m-0 min-w-0 flex-1 truncate font-mono text-xs text-fg-2">
          {ref}
        </p>
        <Button size="sm" variant="ghost" onClick={onHide}>
          Hide
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            void korev().terminal.close(target);
            onHide();
          }}
        >
          End session
        </Button>
      </div>
      <TerminalPane target={target} />
    </section>
  );
}
