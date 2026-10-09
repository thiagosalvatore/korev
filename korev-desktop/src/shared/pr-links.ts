export interface PrLink {
  label: string;
  url: string;
}

const GITHUB = 'https://github.com';
const PR_REF = /(^|[\s([])((?:([\w.-]+\/[\w.-]+))?#(\d+))(?![\w-])/g;
const PR_URL = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/;

export function isPrUrl(text: string): boolean {
  return PR_URL.test(text);
}

function prRefUrl(
  repo: string | undefined,
  number: string,
  repoUrl: string | null,
): string | null {
  if (repo) return `${GITHUB}/${repo}/pull/${number}`;
  return repoUrl ? `${repoUrl}/pull/${number}` : null;
}

export function splitPrRefs(
  text: string,
  repoUrl: string | null,
): (string | PrLink)[] {
  const parts: (string | PrLink)[] = [];
  let textStart = 0;
  for (const match of text.matchAll(PR_REF)) {
    const [, before, label, repo, number] = match;
    const url = prRefUrl(repo, number, repoUrl);
    if (!url) continue;
    const labelStart = match.index + before.length;
    if (labelStart > textStart) parts.push(text.slice(textStart, labelStart));
    parts.push({ label, url });
    textStart = labelStart + label.length;
  }
  if (textStart < text.length) parts.push(text.slice(textStart));
  return parts;
}
