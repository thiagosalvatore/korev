import type { AgentTaskKind, AgentTaskState } from '../../shared/agent-tasks';
import {
  createEncryptedFile,
  hasSecureStorage,
  type SecretCipher,
} from '../encrypted-file';
import type { FileSystem } from '../file-system';
import type { AnsweredQuestion } from './contract';

export interface TaskRecord {
  kind: AgentTaskKind;
  state: AgentTaskState;
  answered: AnsweredQuestion[];
}

export type TaskRecords = Record<string, TaskRecord>;

export interface TaskStore {
  load(login: string): Promise<TaskRecords>;
  save(login: string, records: TaskRecords): Promise<void>;
  clear(): Promise<void>;
}

interface StoreFile {
  version: number;
  login: string;
  records: TaskRecords;
}

export const TASK_STORE_VERSION = 1;

function sameLogin(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function parseRecords(text: string, login: string): TaskRecords {
  try {
    const parsed = JSON.parse(text) as Partial<StoreFile>;
    if (parsed.version !== TASK_STORE_VERSION) return {};
    if (typeof parsed.login !== 'string' || !sameLogin(parsed.login, login)) {
      return {};
    }
    return parsed.records && typeof parsed.records === 'object'
      ? parsed.records
      : {};
  } catch {
    return {};
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

  async function load(login: string): Promise<TaskRecords> {
    const read = await file.read();
    return read.status === 'read' ? parseRecords(read.text, login) : {};
  }

  async function write(login: string, records: TaskRecords): Promise<void> {
    if (!(await hasSecureStorage(deps.cipher))) return;
    const contents: StoreFile = {
      version: TASK_STORE_VERSION,
      login,
      records,
    };
    await file.write(JSON.stringify(contents));
  }

  return {
    load,
    save: (login, records) => afterLastWrite(() => write(login, records)),
    clear: () => afterLastWrite(() => file.remove()),
  };
}
