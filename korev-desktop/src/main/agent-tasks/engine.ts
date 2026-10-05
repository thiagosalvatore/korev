import {
  ACTIVITY_KEPT,
  type AgentActivity,
  type AgentActivityEvent,
  type AgentActivityLine,
  type AgentQuestion,
  type AgentTaskKind,
  type AgentTaskState,
  type AgentTaskStep,
  KOREV_RUNS_KEPT,
  keepsCheckout,
  type QuestionAnswers,
  type ReviewDraft,
  type KorevRun,
} from '../../shared/agent-tasks';
import { myPrsIn, pullRequestsIn } from '../../inbox/stacks';
import type { InboxSnapshot, MyPr } from '../../shared/inbox';
import { prRef } from '../../shared/pr-ref';
import type { ActionResult } from '../../shared/merge';
import type { PrState, PullRequest } from '../../shared/pull-request';
import { describeError } from '../github/errors';
import type { AnsweredQuestion } from './contract';
import {
  FRESH_MEMORY,
  HELD_SUMMARY,
  decide,
  holdQuestions,
  type AutopilotMemory,
} from './keep-mergeable';
import { NO_TASKS, type TaskRecord, type TaskStore } from './task-store';

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

export class UnpushedChangesError extends TaskError {
  constructor(
    message: string,
    readonly sha: string,
  ) {
    super(message);
    this.name = 'UnpushedChangesError';
  }
}

export interface TaskRun {
  ref: string;
  pr: PullRequest;
  instructions: string;
  answered: AnsweredQuestion[];
  signal: AbortSignal;
  step(step: AgentTaskStep): void;
  activity(line: AgentActivityLine): void;
}

export type TaskOutcome =
  | {
      status: 'done';
      summary: string;
      commits: string[];
      rerunRunIds?: number[];
      review?: ReviewDraft;
    }
  | { status: 'needs-input'; questions: AgentQuestion[] };

export interface AgentTask {
  run(run: TaskRun): Promise<TaskOutcome>;
}

export interface AgentTasksDeps {
  tasks: Record<AgentTaskKind, AgentTask>;
  findPr(ref: string): PullRequest | null;
  isWatched(ref: string): boolean;
  prState(ref: string): Promise<PrState | null>;
  instructions(kind: AgentTaskKind): string;
  store: TaskStore;
  login(): string | null;
  releaseCheckout(ref: string): Promise<void>;
  now(): number;
  onChange(): void;
  onSettled(ref: string, state: AgentTaskState): void;
  onActivity(event: AgentActivityEvent): void;
  warn(message: string): void;
}

export interface AgentTasks {
  state(): Record<string, AgentTaskState>;
  start(ref: string, kind: AgentTaskKind): ActionResult;
  answer(ref: string, answers: QuestionAnswers): ActionResult;
  cancel(ref: string): void;
  dismiss(ref: string): Promise<void>;
  reconcile(snapshot: InboxSnapshot): void;
  history(): Record<string, KorevRun[]>;
  activity(ref: string): AgentActivity[];
  updateReview(ref: string, review: ReviewDraft | null, summary?: string): void;
  restore(login: string): Promise<void>;
  clear(): Promise<void>;
  keptRefs(): string[];
  workingRefs(): string[];
  isBusy(): boolean;
  stop(): void;
}

const OK: ActionResult = { ok: true };

const READ_ONLY_KINDS: ReadonlySet<AgentTaskKind> = new Set([
  'explain',
  'review',
]);

function isFixing(state: AgentTaskState): boolean {
  return state.status === 'running' && !READ_ONLY_KINDS.has(state.kind);
}

function failure(message: string): ActionResult {
  return { ok: false, message };
}

function isActive(record: TaskRecord | undefined): boolean {
  return record?.state.status === 'running';
}

function failedState(kind: AgentTaskKind, error: unknown): AgentTaskState {
  const message = describeError(error);
  return error instanceof UnpushedChangesError
    ? { status: 'failed', kind, message, unpushed: error.sha }
    : { status: 'failed', kind, message };
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
  const memories = new Map<string, AutopilotMemory>();
  const controllers = new Map<string, AbortController>();
  const activityLogs = new Map<string, AgentActivity[]>();
  let waiting: string[] = [];
  let running = 0;
  let stopped = false;

  function persist(): void {
    const login = deps.login();
    if (!login) return;
    deps.store
      .save(login, {
        records: Object.fromEntries(records),
        autopilot: Object.fromEntries(memories),
      })
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

  function withRun(record: TaskRecord, state: AgentTaskState): TaskRecord {
    if (state.status !== 'done' && state.status !== 'failed') return record;
    const run: KorevRun = {
      kind: state.kind,
      outcome: state.status,
      summary: state.status === 'done' ? state.summary : state.message,
      commits: state.status === 'done' ? state.commits : [],
      finishedAt: new Date(deps.now()).toISOString(),
    };
    return {
      ...record,
      history: [run, ...(record.history ?? [])].slice(0, KOREV_RUNS_KEPT),
    };
  }

  function settle(ref: string, state: AgentTaskState): void {
    const record = records.get(ref);
    if (record) put(ref, withRun(record, state));
    setState(ref, state);
    if (!keepsCheckout(state)) release(ref);
    deps.onSettled(ref, state);
  }

  function finishedAt(): string {
    return new Date(deps.now()).toISOString();
  }

  function holdForLater(
    ref: string,
    kind: AgentTaskKind,
    outcome: TaskOutcome,
  ) {
    if (outcome.status !== 'needs-input') return;
    const memory = memories.get(ref) ?? FRESH_MEMORY;
    memories.set(ref, holdQuestions(memory, kind, outcome.questions));
    settle(ref, {
      status: 'done',
      kind,
      summary: HELD_SUMMARY,
      commits: [],
      finishedAt: finishedAt(),
    });
  }

  function askWithHeld(
    ref: string,
    questions: TaskOutcome & { status: 'needs-input' },
  ) {
    const memory = memories.get(ref);
    if (!memory?.held.length) return questions.questions;
    memories.set(ref, { ...memory, held: [], heldKind: null });
    return [...memory.held, ...questions.questions];
  }

  function finish(ref: string, kind: AgentTaskKind, outcome: TaskOutcome) {
    const record = records.get(ref);
    if (
      outcome.status === 'needs-input' &&
      record?.autopilot &&
      kind !== 'fix-conflicts'
    ) {
      holdForLater(ref, kind, outcome);
      return;
    }
    if (outcome.status === 'needs-input') {
      settle(ref, {
        status: 'needs-input',
        kind,
        questions: askWithHeld(ref, outcome),
      });
      return;
    }
    settle(ref, {
      status: 'done',
      kind,
      summary: outcome.summary,
      commits: outcome.commits,
      ...(outcome.rerunRunIds?.length
        ? { rerunRunIds: outcome.rerunRunIds }
        : {}),
      ...(outcome.review ? { review: outcome.review } : {}),
      finishedAt: finishedAt(),
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
    const activity = (line: AgentActivityLine) => {
      if (controller.signal.aborted) return;
      const entry = { at: new Date(deps.now()).toISOString(), ...line };
      const log = [...(activityLogs.get(ref) ?? []), entry];
      activityLogs.set(ref, log.slice(-ACTIVITY_KEPT));
      deps.onActivity({ ref, entry });
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
        activity,
      });
      if (!controller.signal.aborted) finish(ref, kind, outcome);
    } catch (error) {
      if (stopped) return;
      if (controller.signal.aborted) return;
      settle(ref, failedState(kind, error));
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
    autopilot = false,
  ) {
    activityLogs.delete(ref);
    put(ref, {
      kind,
      answered,
      autopilot,
      history: records.get(ref)?.history,
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
      id: question.id,
      question: question.question,
      context: question.context,
      answer: answers[question.id].trim(),
    }));
    const memory = memories.get(ref);
    if (memory) {
      memories.set(ref, {
        ...memory,
        attempts: { ...memory.attempts, [record.kind]: 0 },
      });
    }
    begin(
      ref,
      record.kind,
      [...record.answered, ...answered],
      record.autopilot,
    );
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
    if (!state || !ENDED_STATES.has(state)) return;
    memories.delete(ref);
    await dismiss(ref);
  }

  function ask(ref: string, memory: AutopilotMemory): void {
    const kind = memory.heldKind;
    if (!kind) return;
    memories.set(ref, { ...memory, held: [], heldKind: null });
    const state: AgentTaskState = {
      status: 'needs-input',
      kind,
      questions: memory.held,
    };
    put(ref, {
      kind,
      answered: records.get(ref)?.answered ?? [],
      autopilot: true,
      state,
    });
    deps.onSettled(ref, state);
  }

  function isBlocked(record: TaskRecord | undefined): boolean {
    return isActive(record) || (!!record && keepsCheckout(record.state));
  }

  function keepMergeable(item: MyPr): void {
    const ref = prRef(item.pr);
    if (!deps.isWatched(ref)) {
      memories.delete(ref);
      return;
    }
    const record = records.get(ref);
    if (item.queue?.kind === 'queued' || isBlocked(record)) return;
    const decision = decide(item.pr, memories.get(ref) ?? FRESH_MEMORY);
    memories.set(ref, decision.memory);
    if (decision.kind === 'ask') ask(ref, decision.memory);
    if (decision.kind === 'start') {
      begin(ref, decision.step, record?.answered ?? [], true);
    }
  }

  function dismissIfPushed(pr: PullRequest): void {
    const ref = prRef(pr);
    const state = records.get(ref)?.state;
    if (state?.status === 'failed' && state.unpushed === pr.headRefOid) {
      void dismiss(ref);
    }
  }

  function forgetGoneMemories(snapshot: InboxSnapshot, present: Set<string>) {
    if (snapshot.truncated.mine) return;
    for (const ref of memories.keys()) {
      if (!present.has(ref)) memories.delete(ref);
    }
  }

  function reconcile(snapshot: InboxSnapshot): void {
    const present = snapshotRefs(snapshot);
    for (const [ref, record] of records) {
      if (present.has(ref) || isActive(record)) continue;
      if (keepsCheckout(record.state)) void dropIfEnded(ref);
      else put(ref, null);
    }
    forgetGoneMemories(snapshot, present);
    pullRequestsIn(snapshot).forEach(dismissIfPushed);
    myPrsIn(snapshot.mine).forEach(keepMergeable);
    persist();
  }

  async function restore(login: string): Promise<void> {
    const loaded = await deps.store.load(login).catch(() => NO_TASKS);
    records.clear();
    memories.clear();
    for (const [ref, record] of Object.entries(loaded.records)) {
      records.set(ref, restored(record));
    }
    for (const [ref, memory] of Object.entries(loaded.autopilot)) {
      memories.set(ref, memory);
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
    memories.clear();
    deps.onChange();
    await deps.store.clear();
  }

  function updateReview(
    ref: string,
    review: ReviewDraft | null,
    summary?: string,
  ): void {
    const record = records.get(ref);
    if (record?.state.status !== 'done') return;
    const { review: _previous, ...rest } = record.state;
    put(ref, {
      ...record,
      state: {
        ...rest,
        ...(review ? { review } : {}),
        summary: summary ?? rest.summary,
      },
    });
  }

  return {
    updateReview,
    activity: (ref) => activityLogs.get(ref) ?? [],
    history: () =>
      Object.fromEntries(
        [...records].flatMap(([ref, record]) =>
          record.history?.length ? [[ref, record.history]] : [],
        ),
      ),
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
        .filter(([, record]) => keepsCheckout(record.state))
        .map(([ref]) => ref),
    workingRefs: () =>
      [...records]
        .filter(([, record]) => isFixing(record.state))
        .map(([ref]) => ref),
    isBusy: () => running > 0 || waiting.length > 0,
    stop: () => {
      stopped = true;
      abortAll();
    },
  };
}
