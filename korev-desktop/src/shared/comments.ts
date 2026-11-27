export interface DiffComment {
  id: string;
  file: string;
  line: number;
  code: string;
  body: string;
}

export function formatComments(comments: DiffComment[]): string {
  if (!comments.length) return '';
  const lines = comments.map(
    (comment) =>
      `- ${comment.file}:${comment.line} \`${comment.code.trim()}\`\n  ${comment.body}`,
  );
  return `\n\nReview comments on the diff:\n${lines.join('\n')}`;
}
