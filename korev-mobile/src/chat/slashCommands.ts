const SLASH_TOKEN = /^\/(\S*)$/;

export function slashSuggestions(
  text: string,
  commands: readonly string[],
): string[] | null {
  const query = SLASH_TOKEN.exec(text)?.[1];
  if (query === undefined) return null;
  const prefix = query.toLowerCase();
  return commands.filter((name) => name.toLowerCase().startsWith(prefix));
}
