import { useLayoutEffect, useRef } from 'react';
import { cn } from '../../design-system';
import type { AgentActivity } from '../../shared/agent-tasks';

const PINNED_SLACK_PX = 24;
const WAITING_FOR_AGENT = "Waiting for the agent's first step…";
const NOTHING_RECORDED = 'Korev has no record of what the agent did.';

export interface ActivityFeedProps {
  entries: AgentActivity[];
  running: boolean;
  className?: string;
}

function isNearBottom(element: HTMLElement): boolean {
  const hidden = element.scrollHeight - element.scrollTop;
  return hidden - element.clientHeight < PINNED_SLACK_PX;
}

function useFollowNewest(count: number) {
  const scroller = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element && following.current) element.scrollTop = element.scrollHeight;
  }, [count]);
  const onScroll = () => {
    if (scroller.current) following.current = isNearBottom(scroller.current);
  };
  return { scroller, onScroll };
}

function ActivityLine({ entry }: { entry: AgentActivity }) {
  if (entry.kind === 'step') {
    return (
      <li className="font-mono text-xs break-words text-fg-2">{entry.text}</li>
    );
  }
  return (
    <li className="text-sm whitespace-pre-wrap text-fg-1">{entry.text}</li>
  );
}

export function ActivityFeed({
  entries,
  running,
  className,
}: ActivityFeedProps) {
  const { scroller, onScroll } = useFollowNewest(entries.length);
  return (
    <div
      ref={scroller}
      onScroll={onScroll}
      className={cn('min-h-0 overflow-auto', className)}
    >
      <h3 className="m-0 mb-2 type-overline text-fg-3">Activity</h3>
      {entries.length === 0 ? (
        <p className="m-0 text-sm text-fg-3">
          {running ? WAITING_FOR_AGENT : NOTHING_RECORDED}
        </p>
      ) : (
        <ol
          role="log"
          aria-label="What Korev's agent did"
          className="m-0 flex list-none flex-col gap-2 p-0"
        >
          {entries.map((entry, index) => (
            <ActivityLine key={`${entry.at}:${index}`} entry={entry} />
          ))}
        </ol>
      )}
    </div>
  );
}
