import {
  mkdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { dirname } from 'node:path';

export interface FileSystem {
  read(path: string): Promise<Buffer | null>;
  writeAtomic(path: string, contents: Buffer | string): Promise<void>;
  remove(path: string): Promise<void>;
  link(target: string, path: string): Promise<void>;
  makeDir(path: string): Promise<void>;
}

const MISSING_FILE_CODE = 'ENOENT';
const EXISTING_FILE_CODE = 'EEXIST';
const TEMP_SUFFIX = '.tmp';

function isMissingFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === MISSING_FILE_CODE;
}

function isExistingFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === EXISTING_FILE_CODE;
}

export const nodeFileSystem: FileSystem = {
  async read(path) {
    try {
      return await readFile(path);
    } catch (error) {
      if (isMissingFile(error)) return null;
      throw error;
    }
  },
  async writeAtomic(path, contents) {
    await mkdir(dirname(path), { recursive: true });
    const tempPath = `${path}${TEMP_SUFFIX}`;
    await writeFile(tempPath, contents, { mode: 0o600 });
    await rename(tempPath, path);
  },
  async remove(path) {
    await rm(path, { force: true });
  },
  async link(target, path) {
    await mkdir(dirname(path), { recursive: true });
    await rm(path, { force: true });
    try {
      await symlink(target, path);
    } catch (error) {
      if (!isExistingFile(error)) throw error;
    }
  },
  async makeDir(path) {
    await mkdir(path, { recursive: true });
  },
};

export function createMemoryFileSystem(
  initial: Record<string, Buffer | string> = {},
): FileSystem & {
  files: Map<string, Buffer>;
  links: Map<string, string>;
  dirs: Set<string>;
} {
  const files = new Map<string, Buffer>(
    Object.entries(initial).map(([path, contents]) => [
      path,
      Buffer.from(contents),
    ]),
  );
  const links = new Map<string, string>();
  const dirs = new Set<string>();
  return {
    files,
    links,
    dirs,
    async read(path) {
      return files.get(path) ?? null;
    },
    async writeAtomic(path, contents) {
      files.set(path, Buffer.from(contents));
    },
    async remove(path) {
      files.delete(path);
    },
    async link(target, path) {
      links.set(path, target);
    },
    async makeDir(path) {
      dirs.add(path);
    },
  };
}
