import type { AgentQuestion } from '../../shared/agent-tasks';
import type { PullRequest } from '../../shared/pull-request';
import type { ReviewThread, ThreadComment } from '../github/task-reads';
import {
  buildPrompt,
  outputSchema,
  readTaskOutput,
  type AnsweredQuestion,
  type DataBlock,
} from './contract';
import {
  TaskError,
  type AgentTask,
  type TaskOutcome,
  type TaskRun,
} from './engine';
import {
  FIX_TIMEOUT_MS,
  commitAndPush,
  openForFix,
  retryIfHeadMoved,
  type FixDeps,
} from './fix-steps';
import { MALFORMED_OUTPUT, runStructured, type RunAgent } from './run-agent';

export const ADDRESS_COMMENTS_TIMEOUT_MS = FIX_TIMEOUT_MS;
export const NO_OPEN_THREADS = 'This PR has no unresolved review threads.';
const TRUSTED_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
const OUTSIDER_QUESTION_PREFIX = 'thread:';
const SHORT_SHA = 7;
const DEFAULT_COMMIT_MESSAGE = 'Address review comments';

type ThreadAction = 'fixed' | 'reply' | 'question';

interface ThreadResult {
  id: string;
  action: ThreadAction;
  reply: string;
}

const THREAD_ACTIONS: readonly ThreadAction[] = ['fixed', 'reply', 'question'];

export const ADDRESS_COMMENTS_SCHEMA = outputSchema({
  threads: {
    type: 'array',
    items: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'action', 'reply'],
      properties: {
        id: { type: 'string' },
        action: { type: 'string', enum: THREAD_ACTIONS },
        reply: { type: 'string' },
      },
    },
  },
});

export interface ThreadsForTask {
  trusted: ReviewThread[];
  outsiderQuestions: AgentQuestion[];
}

function isTrusted(comment: ThreadComment, viewerLogin: string | null) {
  const isViewer =
    viewerLogin !== null &&
    comment.authorLogin?.toLowerCase() === viewerLogin.toLowerCase();
  return isViewer || TRUSTED_ASSOCIATIONS.has(comment.association);
}

function outsiderQuestion(thread: ReviewThread): AgentQuestion {
  const [first] = thread.comments;
  return {
    id: `${OUTSIDER_QUESTION_PREFIX}${thread.id}`,
    question: `@${first.authorLogin ?? 'ghost'} doesn't have write access to this repo. Should Korev act on their comment? Say what to do, or "no".`,
    context: `${thread.path}${thread.line ? `:${thread.line}` : ''}\n${first.body}`,
  };
}

function approvedOutsider(
  thread: ReviewThread,
  answered: AnsweredQuestion[],
): boolean {
  return answered.some(
    (entry) => entry.id === `${OUTSIDER_QUESTION_PREFIX}${thread.id}`,
  );
}

export function splitThreads(
  threads: ReviewThread[],
  viewerLogin: string | null,
  answered: AnsweredQuestion[],
): ThreadsForTask {
  const trusted: ReviewThread[] = [];
  const outsiderQuestions: AgentQuestion[] = [];
  for (const thread of threads) {
    const [first] = thread.comments;
    if (isTrusted(first, viewerLogin) || approvedOutsider(thread, answered)) {
      trusted.push({
        ...thread,
        comments: [
          first,
          ...thread.comments
            .slice(1)
            .filter((comment) => isTrusted(comment, viewerLogin)),
        ],
      });
    } else {
      outsiderQuestions.push(outsiderQuestion(thread));
    }
  }
  return { trusted, outsiderQuestions };
}

function threadBlock(thread: ReviewThread): DataBlock {
  const where = `${thread.path}${thread.line ? `:${thread.line}` : ''}`;
  const comments = thread.comments
    .map((comment) => `@${comment.authorLogin ?? 'ghost'}: ${comment.body}`)
    .join('\n\n');
  return {
    label: `Review thread ${thread.id} on ${where}`,
    text: `${thread.diffHunk}\n\n${comments}`,
  };
}

export interface AddressCommentsInput {
  pr: PullRequest;
  threads: ReviewThread[];
  instructions: string;
  answered: AnsweredQuestion[];
}

export function addressCommentsPrompt(input: AddressCommentsInput): string {
  const { pr } = input;
  return buildPrompt({
    task: `You are Korev's review agent. The current folder is a checkout of ${pr.repo} pull request #${pr.number} ("${pr.title}") at its head. Reviewers left the unresolved threads listed below. Address them.`,
    rules: [
      'Add one entry to "threads" for every thread below, with its id and an action: "fixed" when you changed code for it, "reply" when the right answer is an explanation and no change, "question" when the user must decide (also add that question to "questions").',
      'Put the text Korev should post on the thread in "reply": for "fixed", one sentence saying what you changed; for "reply", the explanation itself. Write it to the reviewer, plainly.',
      'Do not run git commands that change the repository, such as add, commit, merge, rebase, reset or checkout. Korev commits, pushes and replies on the threads.',
      'Put a one-sentence summary in "summary". When you changed files, set "changed" to true and write a short commit subject in "commitMessage".',
    ],
    instructions: input.instructions,
    answered: input.answered,
    data: input.threads.map(threadBlock),
    output: 'Reply only with JSON that matches the output schema.',
  });
}

function readThreads(value: unknown, known: Set<string>): ThreadResult[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: Partial<ThreadResult>) =>
    typeof entry?.id === 'string' &&
    known.has(entry.id) &&
    THREAD_ACTIONS.includes(entry.action as ThreadAction) &&
    typeof entry.reply === 'string' &&
    entry.reply.trim()
      ? [
          {
            id: entry.id,
            action: entry.action as ThreadAction,
            reply: entry.reply,
          },
        ]
      : [],
  );
}

function replyBody(result: ThreadResult, sha: string | null): string {
  if (result.action === 'fixed' && sha) {
    return `Fixed in ${sha.slice(0, SHORT_SHA)}: ${result.reply}`;
  }
  return result.reply;
}

export interface AddressCommentsDeps extends FixDeps {
  runAgent: RunAgent;
  viewerLogin(): string | null;
  readThreads(pr: PullRequest): Promise<ReviewThread[]>;
  reply(threadId: string, body: string): Promise<void>;
}

export function createAddressCommentsTask(
  deps: AddressCommentsDeps,
): AgentTask {
  async function postReplies(
    results: ThreadResult[],
    sha: string | null,
  ): Promise<number> {
    const posted = await Promise.all(
      results
        .filter((result) => result.action !== 'question')
        .map((result) =>
          deps.reply(result.id, replyBody(result, sha)).then(
            () => true,
            () => false,
          ),
        ),
    );
    return posted.filter((ok) => !ok).length;
  }

  async function attempt({
    pr,
    instructions,
    answered,
    signal,
    step,
    onActivity,
  }: TaskRun): Promise<TaskOutcome> {
    const threads = await deps.readThreads(pr);
    if (threads.length === 0) throw new TaskError(NO_OPEN_THREADS);
    const { trusted, outsiderQuestions } = splitThreads(
      threads,
      deps.viewerLogin(),
      answered,
    );
    if (trusted.length === 0) {
      return { status: 'needs-input', questions: outsiderQuestions };
    }
    const checkout = await openForFix(deps.checkouts, pr);
    step('running');
    const fields = await runStructured(deps.runAgent, {
      prompt: addressCommentsPrompt({
        pr,
        threads: trusted,
        instructions,
        answered,
      }),
      cwd: checkout.path,
      access: 'edit',
      schema: ADDRESS_COMMENTS_SCHEMA,
      timeoutMs: ADDRESS_COMMENTS_TIMEOUT_MS,
      signal,
      onActivity,
    });
    const output = readTaskOutput(fields);
    if (!output) throw new TaskError(MALFORMED_OUTPUT);
    const questions = [...outsiderQuestions, ...output.questions];
    if (questions.length > 0) return { status: 'needs-input', questions };
    step('pushing');
    const commits = output.changed
      ? await commitAndPush(
          deps,
          checkout,
          pr,
          output.commitMessage ?? DEFAULT_COMMIT_MESSAGE,
        )
      : [];
    const results = readThreads(
      fields.threads,
      new Set(trusted.map((thread) => thread.id)),
    );
    const failedReplies = await postReplies(results, commits[0] ?? null);
    const note =
      failedReplies > 0
        ? ` Korev couldn't reply on ${failedReplies} ${failedReplies === 1 ? 'thread' : 'threads'}.`
        : '';
    return { status: 'done', summary: `${output.summary}${note}`, commits };
  }

  return {
    run: (run) => retryIfHeadMoved(deps.checkouts, run.pr, () => attempt(run)),
  };
}
