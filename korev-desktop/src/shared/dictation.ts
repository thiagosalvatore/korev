export function insertDictation(
  text: string,
  caret: number,
  dictated: string,
): { text: string; caret: number } {
  const before = text.slice(0, caret);
  const after = text.slice(caret);
  const lead = before && !/\s$/.test(before) ? ' ' : '';
  const trail = after && !/^\s/.test(after) ? ' ' : '';
  const inserted = lead + dictated + trail;
  return { text: before + inserted + after, caret: caret + inserted.length };
}
