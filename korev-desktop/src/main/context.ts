import type { KorevEvents } from '../shared/api';
import type {
  Repo,
  Workspace,
  WorkspaceRuntime,
  WorkspaceStatus,
} from '../shared/model';
import type { CommandRunner } from './command-runner';
import type { Git } from './git';
import type { Store } from './store';
import type { Terminals } from './terminals';

export interface Notice {
  title: string;
  body: string;
  workspaceId: string;
}

export interface CoreDeps {
  run: CommandRunner;
  env: NodeJS.ProcessEnv;
  shell: string | undefined;
  home: string;
  emit<E extends keyof KorevEvents>(event: E, payload: KorevEvents[E]): void;
  notify(notice: Notice): void;
  isWindowFocused(): boolean;
  setBadge(count: number): void;
  now(): Date;
  newId(): string;
}

export interface Context {
  deps: CoreDeps;
  store: Store;
  git: Git;
  terminals: Terminals;
  runningSessions: Set<string>;
  focusedWorkspaceId: string | null;
  runtime(workspaceId: string): WorkspaceRuntime;
  setStatus(
    workspaceId: string,
    status: WorkspaceStatus,
    message?: string | null,
  ): void;
  emitState(): void;
  workspace(workspaceId: string): Workspace;
  repo(repoId: string): Repo;
}

export class NotFoundError extends Error {
  constructor(kind: string, id: string) {
    super(`${kind} ${id} not found`);
    this.name = 'NotFoundError';
  }
}

export function terminalRef(workspaceId: string, kind: string): string {
  return `${workspaceId}:${kind}`;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
