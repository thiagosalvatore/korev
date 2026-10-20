import { patchSignature } from '../shared/diff';
import {
  EXPLAINER_FENCE,
  parseExplainer,
  type Explainer,
  type ExplainerOpened,
  type ExplainerRef,
  type ExplainerTarget,
} from '../shared/explainer';
import type {
  AskChat,
  ChatSession,
  Result,
  SendOptions,
} from '../shared/model';
import type { TurnOutcome } from './chats';
import { errorMessage, type Context } from './context';
import { branchPatch } from './git';
import { reviewChatSession } from './workspaces';

const GH_TIMEOUT_MS = 60_000;
const DESCRIPTION_MAX_CHARS = 4_000;
const PR_FIELDS = 'number,url,title,author,headRefOid,body';
const NO_CHANGES = 'There are no changes to explain yet.';
const STILL_WRITING = 'Wait for the agent to finish first.';
const STOPPED = 'Stopped before the explanation was finished.';

const SHAPE = `{
  "headline": "One sentence: what this change does for the people who use the product.",
  "summary": "Two to four sentences of context: the problem and the approach.",
  "before": "How things behave without this change.",
  "after": "How things behave with this change.",
  "flow": [{ "label": "Short name of one stage", "detail": "One or two sentences about it." }],
  "tour": [{
    "title": "Short step title",
    "explanation": "What this part of the change does, in plain words.",
    "why": "Why it is needed.",
    "changes": [{ "file": "path/in/the/diff.ts", "startLine": 10, "endLine": 24 }]
  }],
  "risks": [{ "level": "high | medium | low", "title": "Short title", "explanation": "What to check and why.", "file": "path/in/the/diff.ts" }],
  "questions": ["A question the reviewer could ask the author."],
  "routine": [{ "file": "package-lock.json", "reason": "Why a reviewer can skim it." }],
  "glossary": [{ "term": "A technical word you used", "meaning": "What it means, in one sentence." }]
}`;

const GUIDE = [
  '# How to explain a change in Korev',
  '',
  'Explain the change to a reviewer who has never seen this code. Do not review it for bugs and do not edit any files.',
  '',
  'Write for a smart person outside the team:',
  '- Use short sentences and everyday words. Say what the change does for people first, then how it works.',
  '- Write plain text, not Markdown. Wrap names from the code in backticks.',
  '- Put every technical term you use in the glossary, spelled the same way as in the text.',
  '- Order the walkthrough so each step builds on the one before: where it starts, the main logic, the edge cases, then the tests. Do not follow the file order.',
  '- In each step, cite the lines you talk about by file and line numbers in the new version of the file (the old version for a deleted file). Use the paths exactly as the diff shows them.',
  '- Put every changed file in a walkthrough step or in "routine" with a reason, for example lockfiles, generated code, renames or formatting.',
  '- "flow" has 3 to 6 stages that show how the pieces work together.',
  '- Risks are things a reviewer should check by hand: changed behaviour, data, security, missing tests. Say when you are not sure. Do not comment on style.',
  '- Questions are what the reviewer should ask the author.',
  '',
  `End your reply with exactly one fenced block that starts with \`\`\`${EXPLAINER_FENCE} and holds JSON in this shape:`,
  '',
  SHAPE,
].join('\n');

interface Subject {
  title: string;
  url: string | null;
  author: string | null;
  revision: string;
  patch: string;
  description: string;
}

interface Located {
  session: ChatSession;
  askChatId: string | null;
}

export interface ExplainerHost {
  send(sessionId: string, options: SendOptions): Promise<Result>;
  isRunning(sessionId: string): boolean;
  findSession(sessionId: string): Located | null;
  addAskChat(repoIds: string[], session: ChatSession): AskChat;
}

export interface Explainers {
  start(target: ExplainerTarget): Promise<Result<ExplainerOpened>>;
  get(sessionId: string): Promise<Explainer | null>;
  update(sessionId: string): Promise<Result>;
  turnFinished(session: ChatSession, outcome: TurnOutcome): void;
}

type JsonRecord = Record<string, unknown>;

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function describeSubject(target: ExplainerTarget, subject: Subject): string {
  if (target.kind === 'workspace')
    return `Explain the work on this branch compared to its target branch: ${subject.title}.`;
  const lines = [
    `Explain pull request #${target.number} "${subject.title}"${subject.author ? ` by @${subject.author}` : ''}: ${subject.url}.`,
    'The checkout is the default branch, so files the pull request adds exist only in the diff.',
  ];
  if (subject.description.trim())
    lines.push(
      `The author's description:\n<description>\n${subject.description.slice(0, DESCRIPTION_MAX_CHARS)}\n</description>`,
    );
  return lines.join('\n');
}

function followGuide(guidePath: string): string {
  return `Follow the instructions in ${guidePath} and end your reply with the ${EXPLAINER_FENCE} block they describe.`;
}

export function explainerPrompt(
  target: ExplainerTarget,
  subject: Subject,
  patchPath: string,
  guidePath: string,
): string {
  return [
    describeSubject(target, subject),
    `The whole diff is in ${patchPath}. Read all of it, in parts if it is long. Read the code around it in the checkout when you need more context.`,
    followGuide(guidePath),
  ].join('\n');
}

function updatePrompt(patchPath: string, guidePath: string): string {
  return [
    `The change has moved on. The new diff is in ${patchPath}. Read it again and explain the whole change again.`,
    followGuide(guidePath),
  ].join('\n');
}

function repairPrompt(error: string): string {
  return `Korev could not read your ${EXPLAINER_FENCE} block: ${error}. Reply with only the corrected block.`;
}

function sameTarget(a: ExplainerTarget, b: ExplainerTarget): boolean {
  if (a.kind === 'pr' && b.kind === 'pr')
    return a.repoId === b.repoId && a.number === b.number;
  if (a.kind === 'workspace' && b.kind === 'workspace')
    return a.workspaceId === b.workspaceId;
  return false;
}

export function createExplainers(
  ctx: Context,
  host: ExplainerHost,
): Explainers {
  const repairing = new Set<string>();

  async function gh(cwd: string, args: string[]): Promise<string> {
    const result = await ctx.deps.run('gh', args, {
      cwd,
      env: ctx.deps.env,
      timeoutMs: GH_TIMEOUT_MS,
    });
    if (result.exitCode !== 0)
      throw new Error(result.stderr.trim() || `gh ${args.join(' ')} failed`);
    return result.stdout;
  }

  async function prView(repoId: string, number: number): Promise<JsonRecord> {
    const cwd = ctx.repo(repoId).path;
    const output = await gh(cwd, [
      'pr',
      'view',
      String(number),
      '--json',
      PR_FIELDS,
    ]);
    return JSON.parse(output) as JsonRecord;
  }

  async function prSubject(repoId: string, number: number): Promise<Subject> {
    const cwd = ctx.repo(repoId).path;
    const [view, patch] = await Promise.all([
      prView(repoId, number),
      gh(cwd, ['pr', 'diff', String(number)]),
    ]);
    return {
      title: str(view.title),
      url: str(view.url) || null,
      author: str((view.author as JsonRecord | undefined)?.login) || null,
      revision: str(view.headRefOid),
      patch,
      description: str(view.body),
    };
  }

  async function workspaceSubject(workspaceId: string): Promise<Subject> {
    const workspace = ctx.workspace(workspaceId);
    const patch = await branchPatch(
      ctx.git,
      workspace.path,
      workspace.baseBranch,
    );
    const pr = ctx
      .runtime(workspaceId)
      .prs.find((entry) => entry.state === 'OPEN');
    return {
      title: pr?.title ?? workspace.branch,
      url: pr?.url ?? null,
      author: null,
      revision: patchSignature(patch),
      patch,
      description: '',
    };
  }

  function subject(target: ExplainerTarget): Promise<Subject> {
    return target.kind === 'pr'
      ? prSubject(target.repoId, target.number)
      : workspaceSubject(target.workspaceId);
  }

  async function latestRevision(
    target: ExplainerTarget,
  ): Promise<string | null> {
    try {
      if (target.kind === 'workspace')
        return (await workspaceSubject(target.workspaceId)).revision;
      return (
        str((await prView(target.repoId, target.number)).headRefOid) || null
      );
    } catch {
      return null;
    }
  }

  function sendTo(session: ChatSession, text: string): Promise<Result> {
    return host.send(session.id, {
      text,
      agent: session.agent,
      model: session.model,
      effort: session.effort,
      planMode: false,
      fast: session.fast,
    });
  }

  function existing(target: ExplainerTarget, revision: string): Located | null {
    if (target.kind !== 'pr') return null;
    const ask = ctx.store.state.askChats.find(
      ({ session }) =>
        session.explainer?.status !== 'failed' &&
        session.explainer?.revision === revision &&
        sameTarget(session.explainer.target, target),
    );
    return ask ? { session: ask.session, askChatId: ask.id } : null;
  }

  function addSession(target: ExplainerTarget, session: ChatSession): Located {
    if (target.kind === 'workspace') {
      ctx.workspace(target.workspaceId).sessions.push(session);
      return { session, askChatId: null };
    }
    const ask = host.addAskChat([target.repoId], session);
    return { session, askChatId: ask.id };
  }

  function refFor(target: ExplainerTarget, found: Subject): ExplainerRef {
    return {
      target,
      title: found.title,
      url: found.url,
      author: found.author,
      revision: found.revision,
      status: 'writing',
    };
  }

  function sessionTitle(target: ExplainerTarget, found: Subject): string {
    return target.kind === 'pr'
      ? `#${target.number} ${found.title}`
      : `Explain: ${found.title}`;
  }

  async function start(
    target: ExplainerTarget,
  ): Promise<Result<ExplainerOpened>> {
    let found: Subject;
    try {
      found = await subject(target);
    } catch (error) {
      return { ok: false, message: errorMessage(error) };
    }
    if (!found.patch.trim()) return { ok: false, message: NO_CHANGES };
    const reused = existing(target, found.revision);
    if (reused)
      return {
        ok: true,
        value: { sessionId: reused.session.id, askChatId: reused.askChatId },
      };
    const session: ChatSession = {
      ...reviewChatSession(ctx),
      title: sessionTitle(target, found),
      explainer: refFor(target, found),
    };
    await ctx.store.saveExplainerPatch(session.id, found.patch);
    const guidePath = await ctx.store.saveExplainerGuide(GUIDE);
    const located = addSession(target, session);
    ctx.store.save();
    ctx.emitState();
    const sent = await sendTo(
      session,
      explainerPrompt(
        target,
        found,
        ctx.store.explainerPatchPath(session.id),
        guidePath,
      ),
    );
    if (!sent.ok) return sent;
    return {
      ok: true,
      value: { sessionId: session.id, askChatId: located.askChatId },
    };
  }

  async function get(sessionId: string): Promise<Explainer | null> {
    const ref = host.findSession(sessionId)?.session.explainer;
    if (!ref) return null;
    const [stored, latest] = await Promise.all([
      ctx.store.loadExplainer(sessionId),
      latestRevision(ref.target),
    ]);
    return { ref, ...stored, latestRevision: latest };
  }

  async function update(sessionId: string): Promise<Result> {
    const session = host.findSession(sessionId)?.session;
    const ref = session?.explainer;
    if (!session || !ref) return { ok: false, message: 'No explanation here.' };
    if (host.isRunning(sessionId)) return { ok: false, message: STILL_WRITING };
    let found: Subject;
    try {
      found = await subject(ref.target);
    } catch (error) {
      return { ok: false, message: errorMessage(error) };
    }
    if (!found.patch.trim()) return { ok: false, message: NO_CHANGES };
    await ctx.store.saveExplainerPatch(sessionId, found.patch);
    const guidePath = await ctx.store.saveExplainerGuide(GUIDE);
    session.explainer = refFor(ref.target, found);
    ctx.store.save();
    ctx.emitState();
    return sendTo(
      session,
      updatePrompt(ctx.store.explainerPatchPath(sessionId), guidePath),
    );
  }

  function settle(session: ChatSession, ref: ExplainerRef, error?: string) {
    session.explainer = error
      ? { ...ref, status: 'failed', error }
      : { ...ref, status: 'ready', error: undefined };
    ctx.store.save();
    ctx.emitState();
  }

  function turnFinished(session: ChatSession, outcome: TurnOutcome) {
    const ref = session.explainer;
    if (!ref) return;
    const parsed = parseExplainer(outcome.reply);
    if (parsed.ok) {
      repairing.delete(session.id);
      ctx.background(
        ctx.store
          .saveExplainerContent(session.id, parsed.value)
          .then(() => settle(session, ref)),
      );
      return;
    }
    if (ref.status !== 'writing') return;
    if (outcome.stopped) return settle(session, ref, STOPPED);
    if (repairing.has(session.id)) {
      repairing.delete(session.id);
      return settle(session, ref, parsed.message);
    }
    repairing.add(session.id);
    ctx.background(sendTo(session, repairPrompt(parsed.message)));
  }

  return { start, get, update, turnFinished };
}
