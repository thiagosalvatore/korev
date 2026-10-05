import type { ExplainFormat } from '../../shared/agent-tasks';
import type { PrComment, PullRequest } from '../../shared/pull-request';
import { RUN_TIMEOUT_MS } from '../agents/agents-service';
import type { Checkouts } from '../checkouts';
import {
  buildPrompt,
  outputSchema,
  readTaskOutput,
  type AnsweredQuestion,
  type DataBlock,
} from './contract';
import { TaskError, type AgentTask } from './engine';
import type { StoredExplanation } from './explanations';
import { readPrChanges } from './pr-changes';
import { MALFORMED_OUTPUT, runStructured, type RunAgent } from './run-agent';

export const EXPLAIN_TIMEOUT_MS = RUN_TIMEOUT_MS;

export const EXPLAIN_SCHEMA = outputSchema({ document: { type: 'string' } });

const FORMAT_RULES: Record<ExplainFormat, string> = {
  html: 'Write "document" as an HTML body fragment using only semantic elements: headings, paragraphs, lists, tables, pre and code, and figure with inline SVG for diagrams. No CSS, style attributes, fonts, scripts or external images: Korev applies its own styles.',
  markdown: 'Write "document" as GitHub-flavored Markdown. No HTML, no images.',
};

export interface ExplainInput {
  pr: PullRequest;
  body: string;
  diffStat: string;
  diff: string;
  format: ExplainFormat;
  instructions: string;
  answered: AnsweredQuestion[];
}

function commentBlocks(comments: PrComment[]): DataBlock[] {
  if (comments.length === 0) return [];
  return [
    {
      label: 'PR comments',
      text: comments
        .map((comment) => `@${comment.authorLogin ?? 'ghost'}: ${comment.body}`)
        .join('\n\n'),
    },
  ];
}

export function explainPrompt(input: ExplainInput): string {
  const { pr } = input;
  return buildPrompt({
    task: `You are Korev's explain agent. The current folder is a read-only checkout of ${pr.repo} pull request #${pr.number} ("${pr.title}") at its head commit. The pull request merges ${pr.headRefName} into ${pr.baseRefName}. Explain it.`,
    rules: [
      'Read files in the checkout when the diff alone does not explain a change.',
      FORMAT_RULES[input.format],
      'Put a one-sentence summary of the pull request in "summary". Set "changed" to false and "commitMessage" to null: this task never edits files.',
    ],
    instructions: input.instructions,
    answered: input.answered,
    data: [
      { label: 'PR description', text: input.body || '(empty)' },
      ...commentBlocks(input.pr.comments),
      { label: 'Diff stat', text: input.diffStat },
      { label: 'Diff', text: input.diff },
    ],
    output: 'Reply only with JSON that matches the output schema.',
  });
}

export interface ExplainTaskDeps {
  checkouts: Checkouts;
  runAgent: RunAgent;
  prBody(pr: PullRequest): Promise<string>;
  format(): ExplainFormat;
  save(ref: string, explanation: StoredExplanation): Promise<void>;
  now(): number;
}

export function createExplainTask(deps: ExplainTaskDeps): AgentTask {
  return {
    async run({ ref, pr, instructions, answered, signal, step, activity }) {
      const checkout = await deps.checkouts.open({
        repo: pr.repo,
        number: pr.number,
        baseRefName: pr.baseRefName,
      });
      const [body, changes] = await Promise.all([
        deps.prBody(pr),
        readPrChanges(deps.checkouts, checkout.path, pr),
      ]);
      const format = deps.format();
      step('running');
      const fields = await runStructured(deps.runAgent, {
        prompt: explainPrompt({
          pr,
          body,
          ...changes,
          format,
          instructions,
          answered,
        }),
        cwd: checkout.path,
        access: 'read-only',
        schema: EXPLAIN_SCHEMA,
        timeoutMs: EXPLAIN_TIMEOUT_MS,
        signal,
        onActivity: activity,
      });
      const output = readTaskOutput(fields);
      if (!output || typeof fields.document !== 'string' || !fields.document) {
        throw new TaskError(MALFORMED_OUTPUT);
      }
      await deps.save(ref, {
        headOid: checkout.headOid,
        format,
        document: fields.document,
        createdAt: new Date(deps.now()).toISOString(),
      });
      return { status: 'done', summary: output.summary, commits: [] };
    },
  };
}
