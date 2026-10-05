import { AGENT_TASK_WORDS, type KorevRun } from '../../shared/agent-tasks';
import { formatAge } from '../format';
import { MINUTE_MS, useNow } from '../useNow';

const SHORT_SHA = 7;

function commitUrl(prUrl: string, sha: string): string {
  return `${prUrl.replace(/\/pull\/\d+$/, '')}/commit/${sha}`;
}

export interface KorevActivityProps {
  runs: KorevRun[];
  prUrl: string;
}

export function KorevActivity({ runs, prUrl }: KorevActivityProps) {
  const now = useNow(MINUTE_MS);
  if (runs.length === 0) return null;
  return (
    <ul className="m-0 mt-3 flex list-none flex-col gap-1 p-0 text-sm text-fg-2">
      {runs.map((run) => (
        <li key={`${run.finishedAt}:${run.kind}`} className="min-w-0">
          <span className="font-mono text-2xs text-fg-3">
            {formatAge(run.finishedAt, now)}
          </span>{' '}
          {AGENT_TASK_WORDS[run.kind].name} ·{' '}
          <span
            className={
              run.outcome === 'failed' ? 'text-danger-text' : undefined
            }
          >
            {run.summary}
          </span>
          {run.commits.map((sha) => (
            <a
              key={sha}
              href={commitUrl(prUrl, sha)}
              className="ml-1 font-mono text-xs text-fg-2 underline"
            >
              {sha.slice(0, SHORT_SHA)}
            </a>
          ))}
        </li>
      ))}
    </ul>
  );
}
