import { describe, expect, it, vi } from 'vitest';
import { createTerminals, type Pty, type SpawnPty } from './terminals';

const REF = 'acme/web#7';
const WORKTREE = '/user-data/worktrees/acme/web/7';
const SIZE = { cols: 80, rows: 24 };

function fakePty() {
  let emitData: (data: string) => void = () => undefined;
  let emitExit: (event: { exitCode: number }) => void = () => undefined;
  const pty: Pty = {
    onData: (listener) => {
      emitData = listener;
    },
    onExit: (listener) => {
      emitExit = listener;
    },
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
  };
  return {
    pty,
    output: (data: string) => emitData(data),
    exit: () => emitExit({ exitCode: 0 }),
  };
}

function setup(env: NodeJS.ProcessEnv = { SHELL: '/bin/fish' }) {
  const ptys: ReturnType<typeof fakePty>[] = [];
  const spawnPty = vi.fn<SpawnPty>(() => {
    const created = fakePty();
    ptys.push(created);
    return created.pty;
  });
  const onOutput = vi.fn();
  const onExit = vi.fn();
  const terminals = createTerminals({ spawnPty, env, onOutput, onExit });
  return { terminals, spawnPty, ptys, onOutput, onExit };
}

describe('terminals', () => {
  it("starts the user's login shell in the worktree, without Electron's variables", () => {
    const { terminals, spawnPty } = setup({
      SHELL: '/bin/fish',
      HOME: '/Users/maria',
      ELECTRON_RUN_AS_NODE: '1',
    });

    terminals.open(REF, WORKTREE, SIZE);

    const [file, args, options] = spawnPty.mock.calls[0];
    expect(file).toBe('/bin/fish');
    expect(args).toEqual(['-l']);
    expect(options).toMatchObject({ cwd: WORKTREE, ...SIZE });
    expect(options.env).toMatchObject({ HOME: '/Users/maria' });
    expect(options.env).not.toHaveProperty('ELECTRON_RUN_AS_NODE');
  });

  it('reattaches to the running shell and replays what it printed', () => {
    const { terminals, spawnPty, ptys, onOutput } = setup();
    terminals.open(REF, WORKTREE, SIZE);
    ptys[0].output('$ git status\r\n');

    expect(onOutput).toHaveBeenCalledWith(REF, '$ git status\r\n');
    expect(terminals.open(REF, WORKTREE, SIZE)).toBe('$ git status\r\n');
    expect(spawnPty).toHaveBeenCalledTimes(1);
  });

  it('starts a fresh shell once the last one exited', () => {
    const { terminals, spawnPty, ptys, onExit } = setup();
    terminals.open(REF, WORKTREE, SIZE);
    ptys[0].exit();

    expect(onExit).toHaveBeenCalledWith(REF);
    expect(terminals.open(REF, WORKTREE, SIZE)).toBe('');
    expect(spawnPty).toHaveBeenCalledTimes(2);
  });

  it('kills the shell when closed and ignores input after that', () => {
    const { terminals, ptys, onExit } = setup();
    terminals.open(REF, WORKTREE, SIZE);

    terminals.close(REF);
    terminals.write(REF, 'ls\r');

    expect(ptys[0].pty.kill).toHaveBeenCalled();
    expect(ptys[0].pty.write).not.toHaveBeenCalled();
    expect(onExit).toHaveBeenCalledWith(REF);
  });
});
