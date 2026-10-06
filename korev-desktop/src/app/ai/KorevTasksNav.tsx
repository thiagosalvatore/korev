import {
  Icon,
  SIDEBAR_NAV_COMPACT_ITEM,
  SIDEBAR_NAV_ITEM,
  SidebarNavHeading,
  cn,
  type IconName,
} from '../../design-system';
import {
  AGENT_TASK_WORDS,
  type AgentTaskState,
} from '../../shared/agent-tasks';
import type { InboxSnapshot } from '../../shared/inbox';
import { prRef } from '../../shared/pr-ref';
import type { PullRequest } from '../../shared/pull-request';
import { pullRequestsIn } from '../../inbox/stacks';
import { runningLabel } from './agent-task-state';

export const KOREV_NAV_LABEL = 'Korev';
const NEEDS_ANSWER = 'Needs your answer';
const REVIEW_DRAFT_READY = 'Review draft ready';

export interface KorevTask {
  pr: PullRequest;
  state: AgentTaskState;
}

interface TaskLook {
  icon: IconName;
  text: string;
  iconClass: string;
  textClass: string;
}

const DANGER = 'text-danger-text';

function lookOf(state: AgentTaskState): TaskLook {
  switch (state.status) {
    case 'running':
      return {
        icon: 'loader',
        text: runningLabel(state),
        iconClass: 'animate-spin motion-reduce:animate-none',
        textClass: 'text-fg-3',
      };
    case 'needs-input':
      return {
        icon: 'message-circle-question',
        text: NEEDS_ANSWER,
        iconClass: DANGER,
        textClass: DANGER,
      };
    case 'failed':
      return {
        icon: 'circle-x',
        text: AGENT_TASK_WORDS[state.kind].failed,
        iconClass: DANGER,
        textClass: DANGER,
      };
    case 'done':
      return {
        icon: 'file-pen-line',
        text: REVIEW_DRAFT_READY,
        iconClass: 'text-success-text',
        textClass: 'text-success-text',
      };
  }
}

function needsSidebar(state: AgentTaskState): boolean {
  if (state.kind === 'explain') return false;
  return state.status !== 'done' || state.review !== undefined;
}

export function korevTasks(snapshot: InboxSnapshot | null): KorevTask[] {
  if (!snapshot) return [];
  return pullRequestsIn(snapshot).flatMap((pr) => {
    const state = snapshot.agentTasks[prRef(pr)];
    return state && needsSidebar(state) ? [{ pr, state }] : [];
  });
}

export interface KorevTasksNavProps {
  tasks: KorevTask[];
  activeRef: string | null;
  compact: boolean;
  onOpen: (ref: string) => void;
}

export function KorevTasksNav({
  tasks,
  activeRef,
  compact,
  onOpen,
}: KorevTasksNavProps) {
  if (tasks.length === 0) return null;
  return (
    <nav aria-label={KOREV_NAV_LABEL}>
      <SidebarNavHeading label={KOREV_NAV_LABEL} compact={compact} />
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {tasks.map(({ pr, state }) => {
          const ref = prRef(pr);
          const look = lookOf(state);
          const title = `#${pr.number} ${pr.title}`;
          return (
            <li key={ref}>
              <button
                type="button"
                aria-current={ref === activeRef ? 'page' : undefined}
                title={compact ? `${title} · ${look.text}` : undefined}
                onClick={() => onOpen(ref)}
                className={cn(
                  SIDEBAR_NAV_ITEM,
                  'h-auto py-1.5',
                  compact && SIDEBAR_NAV_COMPACT_ITEM,
                )}
              >
                <Icon name={look.icon} size={16} className={look.iconClass} />
                <span className={cn('min-w-0 flex-1', compact && 'sr-only')}>
                  <span className="block truncate">{title}</span>
                  <span
                    className={cn('block truncate text-xs', look.textClass)}
                  >
                    {look.text}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
