import type {
  AgentQuestion,
  AgentTaskKind,
  AgentTaskState,
  AgentTaskStep,
  QuestionAnswers,
} from '../../shared/agent-tasks';
import { pullRequestsIn } from '../../inbox/stacks';
import type { InboxSnapshot } from '../../shared/inbox';
import { prRef } from '../../shared/pr-ref';
import type { ActionResult } from '../../shared/merge';
import type { PrState, PullRequest } from '../../shared/pull-request';
import { describeError } from '../github/errors';
import type { AnsweredQuestion } from './contract';
import type { TaskRecord, TaskStore } from './task-store';

export const MAX_RUNNING_TASKS = 2;
export const STOPPED_ON_QUIT = 'Stopped when Korev quit';
export const ALREADY_WORKING = 'Korev is already working on this PR';
const PR_NOT_FOUND = "Korev can't find this pull request in your inbox.";
const ANSWER_EVERY_QUESTION = 'Answer every question first.';
const NOTHING_TO_ANSWER = 'Korev has no questions waiting on this PR.';
const ENDED_STATES: ReadonlySet<PrState> = new Set(['MERGED', 'CLOSED']);

export class TaskError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskError';
  }
}

export interface TaskRun {
  ref: string;
  pr: PullRequest;
  instructions: string;
  answered: AnsweredQuestion[];
  signal: AbortSignal;
  step(step: AgentTaskStep): void;
}

export type TaskOutcome =
  | { status: 'done'; summary: string; commits: string[] }
  | { status: 'needs-input'; questions: AgentQuestion[] };

export interface AgentTask {
  run(run: TaskRun): Promise<TaskOutcome>;
}

export interface AgentTasksDeps {
  tasks: Record<AgentTaskKind, AgentTask>;
  findPr(ref: string): PullRequest | null;
  prState(ref: string): Promise<PrState | null>;
  instructions(kind: AgentTaskKind): string;
  store: TaskStore;
  login(): string | null;
  releaseCheckout(ref: string): Promise<void>;
  now(): number;
  onChange(): void;
  onSettled(ref: string, state: AgentTaskState): void;
  warn(message: string): void;
}

export interface AgentTasks {
  state(): Record<string, AgentTaskState>;
  start(ref: string, kind: AgentTaskKind): ActionResult;
  answer(ref: string, answers: QuestionAnswers): ActionResult;
  cancel(ref: string): void;
  dismiss(ref: string): Promise<void>;
  reconcile(snapshot: InboxSnapshot): void;
  restore(login: string): Promise<void>;
  clear(): Promise<void>;
  keptRefs(): string[];
  isBusy(): boolean;
  stop(): void;
}

const OK: ActionResult = { ok: true };

function failure(message: string): ActionResult {
  return { ok: false, message };
}

function isActive(record: TaskRecord | undefined): boolean {
  return record?.state.status === 'running';
}

function restored(record: TaskRecord): TaskRecord {
  if (record.state.status !== 'running') return record;
  return {
    ...record,
    state: { status: 'failed', kind: record.kind, message: STOPPED_ON_QUIT },
  };
}

function snapshotRefs(snapshot: InboxSnapshot): Set<string> {
  return new Set(pullRequestsIn(snapshot).map(prRef));
}

export function createAgentTasks(deps: AgentTasksDeps): AgentTasks {
  const records = new Map<string, TaskRecord>();
  const controllers = new Map<string, AbortController>();
  let waiting: string[] = [];
  let running = 0;
  let stopped = false;

  function persist(): void {
    const login = deps.login();
    if (!login) return;
    deps.store
      .save(login, Object.fromEntries(records))
      .catch((error: unknown) =>
        deps.warn(`Could not save Korev's tasks: ${describeError(error)}`),
      );
  }

  function put(ref: string, record: TaskRecord | null): void {
    if (record) records.set(ref, record);
    else records.delete(ref);
    persist();
    deps.onChange();
  }

  function setState(ref: string, state: AgentTaskState): void {
    const record = records.get(ref);
    if (record) put(ref, { ...record, state });
  }

  function release(ref: string): void {
    deps.releaseCheckout(ref).catch((error: unknown) => {
      deps.warn(`Could not remove the checkout: ${describeError(error)}`);
    });
  }

  function settle(ref: string, state: AgentTaskState): void {
    setState(ref, state);
    if (state.status !== 'needs-input') release(ref);
    deps.onSettled(ref, state);
  }

  function finish(ref: string, kind: AgentTaskKind, outcome: TaskOutcome) {
    if (outcome.status === 'needs-input') {
      settle(ref, {
        status: 'needs-input',
        kind,
        questions: outcome.questions,
      });
      return;
    }
    settle(ref, {
      status: 'done',
      kind,
      summary: outcome.summary,
      commits: outcome.commits,
      finishedAt: new Date(deps.now()).toISOString(),
    });
  }

  async function execute(ref: string): Promise<void> {
    const record = records.get(ref);
    if (!record) return;
    const controller = new AbortController();
    controllers.set(ref, controller);
    running += 1;
    const { kind } = record;
    const step = (next: AgentTaskStep) => {
      const current = records.get(ref)?.state;
      if (current?.status !== 'running' || controller.signal.aborted) return;
      setState(ref, { ...current, step: next });
    };
    try {
      const pr = deps.findPr(ref);
      if (!pr) throw new TaskError(PR_NOT_FOUND);
      step('preparing');
      const outcome = await deps.tasks[kind].run({
        ref,
        pr,
        instructions: deps.instructions(kind),
        answered: record.answered,
        signal: controller.signal,
        step,
      });
      if (!controller.signal.aborted) finish(ref, kind, outcome);
    } catch (error) {
      if (stopped) return;
      if (controller.signal.aborted) return;
      settle(ref, { status: 'failed', kind, message: describeError(error) });
    } finally {
      running -= 1;
      controllers.delete(ref);
      pump();
    }
  }

  function pump(): void {
    while (!stopped && running < MAX_RUNNING_TASKS && waiting.length > 0) {
      const ref = waiting.shift();
      if (ref) void execute(ref);
    }
  }

  function begin(
    ref: string,
    kind: AgentTaskKind,
    answered: AnsweredQuestion[],
  ) {
    put(ref, {
      kind,
      answered,
      state: {
        status: 'running',
        kind,
        step: 'queued',
        startedAt: new Date(deps.now()).toISOString(),
      },
    });
    waiting.push(ref);
    pump();
  }

  function start(ref: string, kind: AgentTaskKind): ActionResult {
    const previous = records.get(ref);
    if (isActive(previous)) return failure(ALREADY_WORKING);
    if (!deps.findPr(ref)) return failure(PR_NOT_FOUND);
    const keepsAnswers =
      previous?.kind === kind && previous.state.status !== 'done';
    begin(ref, kind, keepsAnswers ? previous.answered : []);
    return OK;
  }

  function answer(ref: string, answers: QuestionAnswers): ActionResult {
    const record = records.get(ref);
    if (record?.state.status !== 'needs-input') {
      return failure(NOTHING_TO_ANSWER);
    }
    const { questions } = record.state;
    if (questions.some((question) => !answers[question.id]?.trim())) {
      return failure(ANSWER_EVERY_QUESTION);
    }
    const answered = questions.map((question) => ({
      question: question.question,
      context: question.context,
      answer: answers[question.id].trim(),
    }));
    begin(ref, record.kind, [...record.answered, ...answered]);
    return OK;
  }

  function cancel(ref: string): void {
    if (!isActive(records.get(ref))) return;
    waiting = waiting.filter((queued) => queued !== ref);
    controllers.get(ref)?.abort();
    put(ref, null);
    release(ref);
  }

  async function dismiss(ref: string): Promise<void> {
    controllers.get(ref)?.abort();
    waiting = waiting.filter((queued) => queued !== ref);
    if (!records.has(ref)) return;
    put(ref, null);
    await deps.releaseCheckout(ref).catch((error: unknown) => {
      deps.warn(`Could not remove the checkout: ${describeError(error)}`);
    });
  }

  async function dropIfEnded(ref: string): Promise<void> {
    const state = await deps.prState(ref).catch(() => null);
    if (state && ENDED_STATES.has(state)) await dismiss(ref);
  }

  function reconcile(snapshot: InboxSnapshot): void {
    const present = snapshotRefs(snapshot);
    for (const [ref, record] of records) {
      if (present.has(ref) || isActive(record)) continue;
      if (record.state.status === 'needs-input') void dropIfEnded(ref);
      else put(ref, null);
    }
  }

  async function restore(login: string): Promise<void> {
    const loaded = await deps.store.load(login).catch(() => ({}));
    records.clear();
    for (const [ref, record] of Object.entries(loaded)) {
      records.set(ref, restored(record));
    }
    persist();
    deps.onChange();
  }

  function abortAll(): void {
    waiting = [];
    controllers.forEach((controller) => controller.abort());
  }

  async function clear(): Promise<void> {
    abortAll();
    records.clear();
    deps.onChange();
    await deps.store.clear();
  }

  return {
    state: () =>
      Object.fromEntries(
        [...records].map(([ref, record]) => [ref, record.state]),
      ),
    start,
    answer,
    cancel,
    dismiss,
    reconcile,
    restore,
    clear,
    keptRefs: () =>
      [...records]
        .filter(([, record]) => record.state.status === 'needs-input')
        .map(([ref]) => ref),
    isBusy: () => running > 0 || waiting.length > 0,
    stop: () => {
      stopped = true;
      abortAll();
    },
  };
}
