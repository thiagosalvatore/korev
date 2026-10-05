import {
  AGENT_TASK_WORDS,
  canPushFixes,
  type AgentQuestion,
  type AgentTaskKind,
} from '../../shared/agent-tasks';
import type { PullRequest } from '../../shared/pull-request';

export const MAX_AUTOMATIC_ATTEMPTS = 2;
export const HELD_SUMMARY =
  'Korev has a question for you once nothing else is left';
const GAVE_UP_PREFIX = 'gave-up:';

export interface AutopilotMemory {
  signature: string | null;
  triedOnSignature: AgentTaskKind[];
  attempts: Partial<Record<AgentTaskKind, number>>;
  held: AgentQuestion[];
  heldKind: AgentTaskKind | null;
}

export const FRESH_MEMORY: AutopilotMemory = {
  signature: null,
  triedOnSignature: [],
  attempts: {},
  held: [],
  heldKind: null,
};

export type AutopilotDecision =
  | { kind: 'start'; step: AgentTaskKind; memory: AutopilotMemory }
  | { kind: 'ask'; memory: AutopilotMemory }
  | { kind: 'wait'; memory: AutopilotMemory };

function failingCheckNames(pr: PullRequest): string[] {
  return pr.checks
    .filter((check) => check.outcome === 'failing')
    .map((check) => check.name)
    .sort();
}

export function checksRunning(pr: PullRequest): boolean {
  return (
    pr.ci === 'running' ||
    pr.checks.some((check) => check.outcome === 'pending')
  );
}

export function signatureOf(pr: PullRequest): string {
  return [
    pr.headRefOid,
    pr.mergeable,
    failingCheckNames(pr).join(','),
    pr.unresolvedThreads,
  ].join('|');
}

export function neededSteps(pr: PullRequest): AgentTaskKind[] {
  if (!canPushFixes(pr)) return [];
  const steps: AgentTaskKind[] = [];
  if (pr.mergeable === 'CONFLICTING') steps.push('fix-conflicts');
  if (failingCheckNames(pr).length > 0 && !checksRunning(pr)) {
    steps.push('fix-ci');
  }
  if (pr.unresolvedThreads > 0) steps.push('address-comments');
  return steps;
}

function attemptsStillNeeded(
  attempts: AutopilotMemory['attempts'],
  steps: AgentTaskKind[],
): AutopilotMemory['attempts'] {
  return Object.fromEntries(
    steps.flatMap((step) => (attempts[step] ? [[step, attempts[step]]] : [])),
  );
}

function gaveUpQuestion(step: AgentTaskKind, pr: PullRequest): AgentQuestion {
  const failing = failingCheckNames(pr);
  return {
    id: `${GAVE_UP_PREFIX}${step}`,
    question: `Korev tried to ${AGENT_TASK_WORDS[step].name.toLowerCase()} twice and it still isn't fixed. What should it try next?`,
    context: failing.length > 0 ? `Still failing: ${failing.join(', ')}` : '',
  };
}

export function holdQuestions(
  memory: AutopilotMemory,
  kind: AgentTaskKind,
  questions: AgentQuestion[],
): AutopilotMemory {
  const known = new Set(memory.held.map((question) => question.id));
  return {
    ...memory,
    held: [...memory.held, ...questions.filter(({ id }) => !known.has(id))],
    heldKind: memory.heldKind ?? kind,
  };
}

function askOrWait(
  memory: AutopilotMemory,
  pr: PullRequest,
): AutopilotDecision {
  if (memory.held.length > 0 && !checksRunning(pr)) {
    return { kind: 'ask', memory };
  }
  return { kind: 'wait', memory };
}

export function decide(
  pr: PullRequest,
  previous: AutopilotMemory,
): AutopilotDecision {
  const signature = signatureOf(pr);
  const steps = neededSteps(pr);
  const tried =
    signature === previous.signature ? previous.triedOnSignature : [];
  let memory: AutopilotMemory = {
    ...previous,
    signature,
    triedOnSignature: tried,
    attempts: attemptsStillNeeded(previous.attempts, steps),
  };
  for (const step of steps.filter((candidate) => !tried.includes(candidate))) {
    const attempts = memory.attempts[step] ?? 0;
    memory = {
      ...memory,
      triedOnSignature: [...memory.triedOnSignature, step],
    };
    if (attempts < MAX_AUTOMATIC_ATTEMPTS) {
      return {
        kind: 'start',
        step,
        memory: {
          ...memory,
          attempts: { ...memory.attempts, [step]: attempts + 1 },
        },
      };
    }
    memory = holdQuestions(memory, step, [gaveUpQuestion(step, pr)]);
  }
  return askOrWait(memory, pr);
}
