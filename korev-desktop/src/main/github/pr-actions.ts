import { mergePathFor } from '../../inbox/merge-path';
import { QUEUE_COMMANDS } from '../../inbox/queue-status';
import { myPrsIn } from '../../inbox/stacks';
import type { InboxSnapshot } from '../../shared/inbox';
import type {
  ActionResult,
  MergeRequest,
  MergeTool,
  PrActionState,
  PrTarget,
  RepoMergeInfo,
} from '../../shared/merge';
import { prRef } from '../../shared/pr-ref';
import { describeError } from './errors';
import type { Scheduler, TimerHandle } from './inbox-poller';
import type { AsyncMergeResponse, GithubWriter } from './mutations';

export interface PrActionsDeps {
  writer: GithubWriter;
  token(): string | null;
  repoMerge(repo: string): RepoMergeInfo | undefined;
  mergeWith(repo: string): MergeTool;
  now(): number;
  scheduler: Scheduler;
  onChange(): void;
  refresh(): void;
}

export interface PrActions {
  state(): Record<string, PrActionState>;
  merge(request: MergeRequest): Promise<ActionResult>;
  close(targets: PrTarget[]): Promise<ActionResult>;
  reopen(target: PrTarget): Promise<ActionResult>;
  cancelQueue(target: PrTarget): Promise<ActionResult>;
  reconcile(snapshot: InboxSnapshot): void;
  stop(): void;
}

interface MergeWait {
  request: MergeRequest;
  uuid: string;
  startedAt: number;
}

const SECOND_MS = 1000;
const FAST_CHECK_MS = 3 * SECOND_MS;
const SLOW_CHECK_MS = 10 * SECOND_MS;
const FAST_PHASE_MS = 30 * SECOND_MS;
const MERGE_WAIT_CAP_MS = 5 * 60 * SECOND_MS;
const NOT_CONNECTED = 'Connect GitHub first.';
const ALREADY_RUNNING = 'Korev is already working on this pull request.';
const MERGE_FAILED_FALLBACK = 'GitHub could not merge this pull request.';

const BUSY_KINDS: ReadonlySet<PrActionState['kind']> = new Set([
  'merging',
  'sending',
  'closing',
]);

const SETTLED_KINDS: ReadonlySet<PrActionState['kind']> = new Set([
  'merged',
  'still-merging',
  'closed',
]);

const OK: ActionResult = { ok: true };

function failure(message: string): ActionResult {
  return { ok: false, message };
}

function keyOf(repo: string, number: number): string {
  return prRef({ repo, number });
}

function openPrKeys(snapshot: InboxSnapshot): Set<string> {
  return new Set(myPrsIn(snapshot.mine).map((item) => prRef(item.pr)));
}

export function createPrActions(deps: PrActionsDeps): PrActions {
  const states = new Map<string, PrActionState>();
  const timers = new Set<TimerHandle>();

  function apply(entries: [string, PrActionState | null][]): void {
    for (const [key, state] of entries) {
      if (state) states.set(key, state);
      else states.delete(key);
    }
    deps.onChange();
  }

  function set(keys: string[], state: PrActionState | null): void {
    apply(keys.map((key) => [key, state]));
  }

  function rangeKeys(request: MergeRequest): string[] {
    return request.numbers.map((number) => keyOf(request.target.repo, number));
  }

  function isBusy(key: string): boolean {
    const state = states.get(key);
    return state !== undefined && BUSY_KINDS.has(state.kind);
  }

  async function withToken(
    run: (token: string) => Promise<ActionResult>,
  ): Promise<ActionResult> {
    const token = deps.token();
    return token ? run(token) : failure(NOT_CONNECTED);
  }

  function failMerge(request: MergeRequest, message: string): ActionResult {
    for (const key of rangeKeys(request)) states.delete(key);
    set([keyOf(request.target.repo, request.target.number)], {
      kind: 'merge-failed',
      message,
    });
    return failure(message);
  }

  function settleMerge(
    request: MergeRequest,
    response: AsyncMergeResponse,
  ): ActionResult {
    const keys = rangeKeys(request);
    switch (response.status) {
      case 'merged':
        set(keys, { kind: 'merged', numbers: request.numbers });
        deps.refresh();
        return OK;
      case 'enqueued':
        set(keys, null);
        deps.refresh();
        return OK;
      default:
        return failMerge(request, response.message ?? MERGE_FAILED_FALLBACK);
    }
  }

  function schedule(delayMs: number, run: () => Promise<void>): void {
    const handle = deps.scheduler.setTimeout(() => {
      timers.delete(handle);
      void run();
    }, delayMs);
    timers.add(handle);
  }

  function nextCheck(wait: MergeWait): void {
    const elapsed = deps.now() - wait.startedAt;
    if (elapsed >= MERGE_WAIT_CAP_MS) {
      set(rangeKeys(wait.request), {
        kind: 'still-merging',
        numbers: wait.request.numbers,
      });
      deps.refresh();
      return;
    }
    const delay = elapsed < FAST_PHASE_MS ? FAST_CHECK_MS : SLOW_CHECK_MS;
    schedule(delay, () => checkMerge(wait));
  }

  async function checkMerge(wait: MergeWait): Promise<void> {
    const token = deps.token();
    if (!token) return;
    try {
      const response = await deps.writer.mergeAsyncResult(
        token,
        wait.request.target,
        wait.uuid,
      );
      if (response.status === 'pending') nextCheck(wait);
      else settleMerge(wait.request, response);
    } catch {
      nextCheck(wait);
    }
  }

  async function mergeAsync(
    token: string,
    request: MergeRequest,
    viaQueue: boolean,
  ): Promise<ActionResult> {
    set(rangeKeys(request), { kind: 'merging', numbers: request.numbers });
    const response = await deps.writer.mergeAsync(token, request.target, {
      action: viaQueue ? 'merge_queue' : 'direct_merge',
      method: viaQueue ? null : request.method,
    });
    if (response.status !== 'pending' || !response.uuid) {
      return settleMerge(request, response);
    }
    nextCheck({ request, uuid: response.uuid, startedAt: deps.now() });
    return OK;
  }

  async function postCommand(
    token: string,
    target: PrTarget,
    command: string,
  ): Promise<ActionResult> {
    const key = keyOf(target.repo, target.number);
    set([key], { kind: 'sending' });
    await deps.writer.addComment(token, target.id, command);
    set([key], null);
    deps.refresh();
    return OK;
  }

  async function runMerge(
    token: string,
    request: MergeRequest,
  ): Promise<ActionResult> {
    const { repo } = request.target;
    const path = mergePathFor(deps.repoMerge(repo), deps.mergeWith(repo));
    if (path.kind === 'comment') {
      return postCommand(
        token,
        request.target,
        QUEUE_COMMANDS[path.tool].merge,
      );
    }
    return mergeAsync(token, request, path.kind === 'github-queue');
  }

  async function merge(request: MergeRequest): Promise<ActionResult> {
    if (rangeKeys(request).some(isBusy)) return failure(ALREADY_RUNNING);
    return withToken(async (token) => {
      try {
        return await runMerge(token, request);
      } catch (error) {
        return failMerge(request, describeError(error));
      }
    });
  }

  async function closeOne(
    token: string,
    target: PrTarget,
  ): Promise<[string, PrActionState]> {
    const key = keyOf(target.repo, target.number);
    try {
      await deps.writer.closePullRequest(token, target.id);
      return [key, { kind: 'closed' }];
    } catch (error) {
      return [key, { kind: 'close-failed', message: describeError(error) }];
    }
  }

  async function close(targets: PrTarget[]): Promise<ActionResult> {
    const keys = targets.map((target) => keyOf(target.repo, target.number));
    if (keys.some(isBusy)) return failure(ALREADY_RUNNING);
    return withToken(async (token) => {
      set(keys, { kind: 'closing' });
      const results = await Promise.all(
        targets.map((target) => closeOne(token, target)),
      );
      apply(results);
      if (results.some(([, state]) => state.kind === 'closed')) deps.refresh();
      const messages = results.flatMap(([, state]) =>
        state.kind === 'close-failed' ? [state.message] : [],
      );
      return messages.length > 0 ? failure(messages[0]) : OK;
    });
  }

  async function reopen(target: PrTarget): Promise<ActionResult> {
    return withToken(async (token) => {
      try {
        await deps.writer.reopenPullRequest(token, target.id);
      } catch (error) {
        return failure(describeError(error));
      }
      set([keyOf(target.repo, target.number)], null);
      deps.refresh();
      return OK;
    });
  }

  async function cancelQueue(target: PrTarget): Promise<ActionResult> {
    const path = mergePathFor(
      deps.repoMerge(target.repo),
      deps.mergeWith(target.repo),
    );
    return withToken(async (token) => {
      try {
        if (path.kind === 'comment') {
          return await postCommand(
            token,
            target,
            QUEUE_COMMANDS[path.tool].cancel,
          );
        }
        await deps.writer.dequeuePullRequest(token, target.id);
      } catch (error) {
        set([keyOf(target.repo, target.number)], null);
        return failure(describeError(error));
      }
      deps.refresh();
      return OK;
    });
  }

  function reconcile(snapshot: InboxSnapshot): void {
    const open = openPrKeys(snapshot);
    const gone = [...states].filter(
      ([key, state]) => SETTLED_KINDS.has(state.kind) && !open.has(key),
    );
    if (gone.length === 0) return;
    set(
      gone.map(([key]) => key),
      null,
    );
  }

  function stop(): void {
    timers.forEach((handle) => deps.scheduler.clearTimeout(handle));
    timers.clear();
  }

  return {
    state: () => Object.fromEntries(states),
    merge,
    close,
    reopen,
    cancelQueue,
    reconcile,
    stop,
  };
}
