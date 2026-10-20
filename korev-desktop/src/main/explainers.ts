import { patchSignature } from '../shared/diff';
import {
  EXPLAINER_FENCE,
  parseExplainer,
  stackPatch,
  type Explainer,
  type ExplainerOpened,
  type ExplainerRef,
  type ExplainerTarget,
  type StackLayer,
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
import { chatSessionOn } from './workspaces';

const GH_TIMEOUT_MS = 60_000;
const DESCRIPTION_MAX_CHARS = 4_000;
const PR_FIELDS = 'number,url,title,author,headRefOid,baseRefName,body';
const MAX_STACK_LAYERS = 10;
const NO_CHANGES = 'There are no changes to explain yet.';
const STILL_WRITING = 'Wait for the agent to finish first.';
const STOPPED = 'Stopped before the explanation was finished.';

const SHAPE = `{
  "headline": "One sentence of at most 20 words: what this change does for the people who use the product. No names from the code.",
  "summary": "Two to four sentences of context: the problem and the approach.",
  "before": "How things behave without this change, as people see it. No names from the code.",
  "after": "How things behave with this change, as people see it. No names from the code.",
  "flow": [{ "label": "Short name of one stage", "detail": "One or two sentences about it." }],
  "tour": [{
    "title": "Short step title",
    "explanation": "First one sentence a person outside the team understands, with no names from the code. Then the details.",
    "why": "Why it is needed.",
    "changes": [{ "file": "path/in/the/diff.ts", "startLine": 10, "endLine": 24 }],
    "pr": 123
  }],
  "layers": [{ "pr": 123, "summary": "What this pull request adds on top of the one below it." }],
  "risks": [{ "level": "high | medium | low", "title": "Short title", "explanation": "What to check and why.", "file": "path/in/the/diff.ts" }],
  "questions": ["A question the reviewer could ask the author."],
  "routine": [{ "file": "package-lock.json", "reason": "Why a reviewer can skim it." }],
  "glossary": [{ "term": "A technical word you used", "meaning": "What it means, in one sentence." }]
}`;

const GUIDE = [
  '# How to explain a change in Korev',
  '',
  'Explain the change to a reviewer who has never seen this code. Do not review it for bugs and do not edit any files.',
  'Read the diff and the checkout with your Read, Grep and Glob tools.',
  '',
  'Write for a smart person outside the team:',
  '- Use short sentences and everyday words. Say what the change does for people first, then how it works.',
  '- Keep names from the code (functions, classes, fields) out of the headline, the summary, before, after and flow. Use them only in walkthrough details, risks and questions, and only when the reader needs them to find the code.',
  '- Write plain text, not Markdown. Wrap names from the code in backticks.',
  '- Put every technical term you use in the glossary, spelled the same way as in the text.',
  '- Order the walkthrough so each step builds on the one before: where it starts, the main logic, the edge cases, then the tests. Do not follow the file order.',
  '- In each step, cite the lines you talk about by file and line numbers in the new version of the file (the old version for a deleted file). Use the paths exactly as the diff shows them.',
  '- Put every changed file in a walkthrough step or in "routine" with a reason, for example lockfiles, generated code, renames or formatting.',
  '- "flow" has 3 to 6 stages that show how the pieces work together.',
  '- Risks are things a reviewer should check by hand: changed behaviour, data, security, missing tests. Say when you are not sure. Do not comment on style.',
  '- Questions are what the reviewer should ask the author.',
  '- "pr" and "layers" are only for a stack of pull requests. Leave them out for one pull request or a branch.',
  '',
  `End your reply with exactly one fenced block that starts with \`\`\`${EXPLAINER_FENCE} and holds JSON in this shape:`,
  '',
  SHAPE,
].join('\n');

interface PrView {
  number: number;
  url: string;
  title: string;
  author: string | null;
  headRefOid: string;
  baseRefName: string;
  body: string;
}

interface Subject {
  title: string;
  url: string | null;
  author: string | null;
  revision: string;
  patch: string;
  layers: PrView[];
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

function toPrView(json: JsonRecord): PrView {
  return {
    number: Number(json.number),
    url: str(json.url),
    title: str(json.title),
    author: str((json.author as JsonRecord | undefined)?.login) || null,
    headRefOid: str(json.headRefOid),
    baseRefName: str(json.baseRefName),
    body: str(json.body),
  };
}

function stackLines(layers: PrView[]): string[] {
  if (layers.length < 2) return [];
  return [
    `It is the top of a stack of ${layers.length} pull requests. Each one builds on the one below it, from the bottom up:`,
    ...layers.map(
      (layer, index) =>
        `${index + 1}. #${layer.number} "${layer.title}": ${layer.url}`,
    ),
    'Explain the stack as one change, so the reviewer understands the whole of it. The diff file has one section per pull request, from the bottom up. Each section starts with a line "### Pull request #N: title", and its diff is against the pull request below it.',
    'Fill "layers" with what each pull request adds, in stack order, and set "pr" on each walkthrough step to the pull request its lines come from.',
  ];
}

function descriptionLines(layers: PrView[]): string[] {
  const described = layers.filter((layer) => layer.body.trim());
  if (!described.length) return [];
  const share = Math.floor(DESCRIPTION_MAX_CHARS / described.length);
  return described.map(
    (layer) =>
      `The author's description of #${layer.number}:\n<description>\n${layer.body.slice(0, share)}\n</description>`,
  );
}

function describeSubject(target: ExplainerTarget, subject: Subject): string {
  const lines =
    target.kind === 'workspace'
      ? [
          `Explain the work on this branch compared to its target branch: ${subject.title}.`,
        ]
      : [
          `Explain pull request #${target.number} "${subject.title}"${subject.author ? ` by @${subject.author}` : ''}: ${subject.url}.`,
          'The checkout is the default branch, so files the pull request adds exist only in the diff.',
        ];
  return [
    ...lines,
    ...stackLines(subject.layers),
    ...descriptionLines(subject.layers),
  ].join('\n');
}

function stackOf(layers: PrView[]): StackLayer[] | undefined {
  if (layers.length < 2) return undefined;
  return layers.map(({ number, title, url }) => ({ number, title, url }));
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

  async function prView(repoId: string, number: number): Promise<PrView> {
    const cwd = ctx.repo(repoId).path;
    const output = await gh(cwd, [
      'pr',
      'view',
      String(number),
      '--json',
      PR_FIELDS,
    ]);
    return toPrView(JSON.parse(output) as JsonRecord);
  }

  async function openPrWithHead(
    repoId: string,
    branch: string,
  ): Promise<PrView | null> {
    const output = await gh(ctx.repo(repoId).path, [
      'pr',
      'list',
      '--head',
      branch,
      '--state',
      'open',
      '--json',
      PR_FIELDS,
    ]);
    const [found] = JSON.parse(output) as JsonRecord[];
    return found ? toPrView(found) : null;
  }

  async function layersBelow(repoId: string, base: string): Promise<PrView[]> {
    const { defaultBranch } = ctx.repo(repoId);
    const below: PrView[] = [];
    let branch = base;
    while (branch !== defaultBranch && below.length < MAX_STACK_LAYERS) {
      const layer = await openPrWithHead(repoId, branch);
      if (!layer) break;
      below.unshift(layer);
      branch = layer.baseRefName;
    }
    return below;
  }

  async function prLayers(repoId: string, number: number): Promise<PrView[]> {
    const top = await prView(repoId, number);
    return [...(await layersBelow(repoId, top.baseRefName)), top];
  }

  function prDiff(repoId: string, number: number): Promise<string> {
    return gh(ctx.repo(repoId).path, ['pr', 'diff', String(number)]);
  }

  function layeredPatch(layers: PrView[], patches: string[]): string {
    if (layers.length < 2) return patches[0] ?? '';
    return stackPatch(
      layers.map((layer, index) => ({ ...layer, patch: patches[index] })),
    );
  }

  async function prSubject(repoId: string, number: number): Promise<Subject> {
    const layers = await prLayers(repoId, number);
    const patches = await Promise.all(
      layers.map((layer) => prDiff(repoId, layer.number)),
    );
    const top = layers[layers.length - 1];
    return {
      title: top.title,
      url: top.url || null,
      author: top.author,
      revision: layers.map((layer) => layer.headRefOid).join(' '),
      patch: layeredPatch(layers, patches),
      layers,
    };
  }

  async function workspaceLayers(workspaceId: string) {
    const workspace = ctx.workspace(workspaceId);
    const local = await branchPatch(
      ctx.git,
      workspace.path,
      workspace.baseBranch,
    );
    const pr = ctx
      .runtime(workspaceId)
      .prs.find((entry) => entry.state === 'OPEN');
    const below = pr ? await layersBelow(workspace.repoId, pr.baseRefName) : [];
    const top: PrView | null = pr
      ? {
          number: pr.number,
          url: pr.url,
          title: pr.title,
          author: null,
          headRefOid: '',
          baseRefName: pr.baseRefName,
          body: '',
        }
      : null;
    const revision = [
      ...below.map((layer) => layer.headRefOid),
      patchSignature(local),
    ].join(' ');
    return { workspace, local, below, top, revision };
  }

  async function workspaceSubject(workspaceId: string): Promise<Subject> {
    const { workspace, local, below, top, revision } =
      await workspaceLayers(workspaceId);
    const layers = top && below.length ? [...below, top] : [];
    const patches = await Promise.all(
      below.map((layer) => prDiff(workspace.repoId, layer.number)),
    );
    return {
      title: top?.title ?? workspace.branch,
      url: top?.url ?? null,
      author: null,
      revision,
      patch: layers.length ? layeredPatch(layers, [...patches, local]) : local,
      layers,
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
        return (await workspaceLayers(target.workspaceId)).revision;
      const layers = await prLayers(target.repoId, target.number);
      return layers.map((layer) => layer.headRefOid).join(' ');
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
      stack: stackOf(found.layers),
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
      ...chatSessionOn(ctx, ctx.store.state.settings.explainModel),
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
