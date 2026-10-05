import type { AgentTaskKind, AgentTaskState } from '../../shared/agent-tasks';
import {
  createEncryptedFile,
  hasSecureStorage,
  type SecretCipher,
} from '../encrypted-file';
import type { FileSystem } from '../file-system';
import type { AnsweredQuestion } from './contract';
import type { AutopilotMemory } from './keep-mergeable';

export interface TaskRecord {
  kind: AgentTaskKind;
  state: AgentTaskState;
  answered: AnsweredQuestion[];
  autopilot?: boolean;
}

export interface StoredTasks {
  records: Record<string, TaskRecord>;
  autopilot: Record<string, AutopilotMemory>;
}

export const NO_TASKS: StoredTasks = { records: {}, autopilot: {} };

export interface TaskStore {
  load(login: string): Promise<StoredTasks>;
  save(login: string, tasks: StoredTasks): Promise<void>;
  clear(): Promise<void>;
}

interface StoreFile extends StoredTasks {
  version: number;
  login: string;
}

export const TASK_STORE_VERSION = 2;

function sameLogin(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function parseTasks(text: string, login: string): StoredTasks {
  try {
    const parsed = JSON.parse(text) as Partial<StoreFile>;
    if (parsed.version !== TASK_STORE_VERSION) return NO_TASKS;
    if (typeof parsed.login !== 'string' || !sameLogin(parsed.login, login)) {
      return NO_TASKS;
    }
    return {
      records: parsed.records ?? {},
      autopilot: parsed.autopilot ?? {},
    };
  } catch {
    return NO_TASKS;
  }
}

export function createTaskStore(deps: {
  cipher: SecretCipher;
  fs: FileSystem;
  path: string;
}): TaskStore {
  const file = createEncryptedFile(deps);
  let lastWrite: Promise<void> = Promise.resolve();

  function afterLastWrite(write: () => Promise<void>): Promise<void> {
    lastWrite = lastWrite.catch(() => undefined).then(write);
    return lastWrite;
  }

  async function load(login: string): Promise<StoredTasks> {
    const read = await file.read();
    return read.status === 'read' ? parseTasks(read.text, login) : NO_TASKS;
  }

  async function write(login: string, tasks: StoredTasks): Promise<void> {
    if (!(await hasSecureStorage(deps.cipher))) return;
    const contents: StoreFile = {
      version: TASK_STORE_VERSION,
      login,
      ...tasks,
    };
    await file.write(JSON.stringify(contents));
  }

  return {
    load,
    save: (login, tasks) => afterLastWrite(() => write(login, tasks)),
    clear: () => afterLastWrite(() => file.remove()),
  };
}
