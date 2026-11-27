export interface FileRef {
  file: string;
  line: number | null;
}

export interface FileRefPart extends FileRef {
  label: string;
}

const LINE_SUFFIX = String.raw`(?::(\d+)(?::\d+)?)?`;
const PATH_SEGMENT = String.raw`[\w.@+-]+`;
const FILE_REF = new RegExp(
  String.raw`^((?:~|\.{1,2})?\/?(?:${PATH_SEGMENT}\/)*${PATH_SEGMENT})${LINE_SUFFIX}$`,
);
const SHORT_EXTENSION = /\.[a-z][a-z0-9]{0,4}$/;
const EXPLICIT_PATH = /^(?:~|\.{1,2})?\//;
const BARE_PATH = new RegExp(
  String.raw`(^|[\s(;])(~?(?:\/${PATH_SEGMENT})+\.[A-Za-z][A-Za-z0-9]*)${LINE_SUFFIX}`,
  'g',
);

export function parseFileRef(text: string): FileRef | null {
  const match = FILE_REF.exec(text);
  if (!match) return null;
  const [, file, line] = match;
  if (!SHORT_EXTENSION.test(file) && !EXPLICIT_PATH.test(file)) return null;
  return { file, line: line ? Number(line) : null };
}

export function splitBarePaths(text: string): (string | FileRefPart)[] {
  const parts: (string | FileRefPart)[] = [];
  let end = 0;
  for (const match of text.matchAll(BARE_PATH)) {
    const [whole, before, file, line] = match;
    const start = match.index + before.length;
    if (start > end) parts.push(text.slice(end, start));
    parts.push({
      file,
      line: line ? Number(line) : null,
      label: whole.slice(before.length),
    });
    end = match.index + whole.length;
  }
  if (end < text.length) parts.push(text.slice(end));
  return parts;
}

export function toWorkspaceRelative(
  workspacePath: string,
  file: string,
): string {
  const prefix = `${workspacePath}/`;
  return file.startsWith(prefix) ? file.slice(prefix.length) : file;
}
