export interface TerminalSize {
  cols: number;
  rows: number;
}

export interface TerminalOutput {
  ref: string;
  data: string;
}

export interface TerminalExit {
  ref: string;
}

export type TerminalOpenResult =
  | { ok: true; scrollback: string }
  | { ok: false; message: string };
