import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { StartTailnet } from './remote-access';

export interface TailnetOptions {
  binary: string;
  stateDir: string;
  hostname: string;
}

interface SidecarStatus {
  ip: string;
  loginUrl: string;
}

export function tailnetStarter(options: TailnetOptions): StartTailnet {
  return (port, onChange) => {
    let status: SidecarStatus = { ip: '', loginUrl: '' };
    let failure: string | null = null;
    let closed = false;
    const sidecar = spawn(
      options.binary,
      [
        '--state-dir',
        options.stateDir,
        '--hostname',
        options.hostname,
        '--port',
        String(port),
      ],
      { stdio: ['pipe', 'pipe', 'ignore'] },
    );

    function fail(message: string) {
      if (closed) return;
      failure = message;
      onChange();
    }

    createInterface({ input: sidecar.stdout }).on('line', (line) => {
      status = JSON.parse(line) as SidecarStatus;
      onChange();
    });
    sidecar.on('error', (error) => fail(error.message));
    sidecar.on('exit', (code) => fail(`Tailscale stopped with code ${code}`));

    return {
      ip: () => status.ip || null,
      loginUrl: () => status.loginUrl || null,
      error: () => failure,
      close() {
        closed = true;
        sidecar.kill();
      },
    };
  };
}
