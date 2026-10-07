import type { ReactNode } from 'react';
import {
  Check as CheckIcon,
  ChevronDown,
  Eye,
  FileCode2,
  FolderGit2,
  GitBranchPlus,
  GitMerge,
  GitPullRequestArrow,
  Link,
  MessageCircleQuestion,
  MessageSquare,
  Send,
  Wrench,
  Archive,
} from 'lucide-react';
import { Button } from '@/components/ds/Button';
import { DiffHunk, type DiffLine } from '@/components/ds/DiffHunk';
import {
  Chat,
  Composer,
  ComposerBar,
  DiffStat,
  KRL_FILES,
  MERGED_PURPLE,
  ModelChips,
  Press,
  SendButton,
  Tabs,
  WorkspaceHeader,
  type ChatItem,
  type Check,
  type FileStat,
  type HeaderAction,
  type PanelProps,
  type Repo,
  type Workspace,
  type WorkspaceState,
} from './parts';

export interface SceneState {
  repos: Repo[];
  selected: string | null;
  askSelected?: boolean;
  askChats?: { title: string; ago: string }[];
  keys: string[] | null;
  panel: PanelProps | null;
  center: ReactNode;
}

export interface Scene {
  id: string;
  label: string;
  duration: number;
  render: (t: number) => SceneState;
}

const RATE_LIMIT_TASK =
  'Add X-RateLimit headers to every API response and document them';
const RATE_LIMIT_NAME = 'Rate limit headers';
const RATE_LIMIT_BRANCH = 'thiago/rate-limit-headers';
export const REVIEW_COMMENT = 'Also set Retry-After on the 429 response.';
const CREATE_PR: HeaderAction = {
  label: 'Create PR',
  icon: GitPullRequestArrow,
  variant: 'primary',
};

function typed(text: string, t: number, start: number, charsPerSecond = 32) {
  if (t < start) return '';
  return text.slice(0, Math.floor(((t - start) / 1000) * charsPerSecond));
}

function workspace(
  id: string,
  branch: string,
  name: string,
  state: WorkspaceState,
  add: number | null,
  del: number | null,
  extra: Partial<Workspace> = {},
): Workspace {
  return { id, branch: `thiago/${branch}`, name, state, add, del, ...extra };
}

const darkModeSettings = (state: WorkspaceState = 'open') =>
  workspace('dm', 'dark-mode-settings', 'Dark mode settings', state, 210, 38);
const webhookRetries = workspace(
  'wh',
  'webhook-retries',
  'Webhook retries',
  'merged',
  96,
  14,
);
const apiRepo = (...extra: Workspace[]): Repo => ({
  name: 'acme/api',
  workspaces: [...extra, webhookRetries],
});
const webRepo = (...workspaces: Workspace[]): Repo => ({
  name: 'acme/web',
  workspaces,
});

function Toast({ children }: { children: ReactNode }) {
  return <div className="km-toast">{children}</div>;
}

const RATE_LIMIT_CHAT: ChatItem[] = [
  { kind: 'user', at: 0, text: RATE_LIMIT_TASK },
  {
    kind: 'tool',
    at: 700,
    tool: 'Read',
    target: 'src/middleware/rateLimit.ts',
  },
  { kind: 'tool', at: 1200, tool: 'Grep', target: '"X-RateLimit" in src/' },
  {
    kind: 'tool',
    at: 1700,
    tool: 'Edit',
    target: 'src/middleware/rateLimit.ts',
    add: 18,
    del: 4,
  },
  {
    kind: 'tool',
    at: 2300,
    tool: 'Edit',
    target: 'src/middleware/rateLimit.test.ts',
    add: 22,
    del: 8,
  },
  {
    kind: 'tool',
    at: 2800,
    tool: 'Write',
    target: 'docs/api/rate-limits.md',
    add: 44,
    del: 0,
  },
  { kind: 'tool', at: 3300, tool: 'Bash', target: 'npm test -- rateLimit' },
  {
    kind: 'agent',
    at: 4300,
    body: (
      <>
        Every response now sends <code>X-RateLimit-Limit</code>,{' '}
        <code>X-RateLimit-Remaining</code> and <code>X-RateLimit-Reset</code>.
        The 12 rate-limit tests pass, and the headers are documented in{' '}
        <code>docs/api/rate-limits.md</code>.
      </>
    ),
  },
  { kind: 'changes', at: 4900, files: 3, add: 84, del: 12 },
];

const WORKSPACE_CREATED_AT = 3200;
const AGENT_DONE_AFTER = 5000;
const FILE_WRITTEN_AT = [1700, 2300, 2800];

function NewWorkspaceScreen({ t }: { t: number }) {
  return (
    <div className="km-new">
      <h4>New workspace</h4>
      <div className="km-newbox">
        <div className="top">
          <span className="km-repo">
            <FolderGit2 size={12} />
            acme/web
            <ChevronDown size={11} />
          </span>
        </div>
        <div className="txt">
          {typed(RATE_LIMIT_TASK, t, 1000, 36)}
          <span className="km-caret" />
        </div>
        <ComposerBar>
          <ModelChips />
          <span className="km-ml" />
          <Press on={t > 2750} style={{ borderRadius: '50%' }}>
            <SendButton />
          </Press>
        </ComposerBar>
      </div>
      <div className="km-newhint">
        Korev creates a worktree on a new branch, copies your <code>.env</code>{' '}
        files, runs your setup script and sends the task to the agent.
      </div>
    </div>
  );
}

function agentStatus(lt: number) {
  if (lt > 3300) return 'Running npm test -- rateLimit';
  if (lt > 1700) return 'Editing';
  return 'Reading';
}

function startDiffStat(lt: number, done: boolean): [number, number] {
  if (done) return [84, 12];
  if (lt > 3300) return [62, 4];
  if (lt > 1700) return [18, 4];
  return [0, 0];
}

function sceneStart(t: number): SceneState {
  const created = t >= WORKSPACE_CREATED_AT;
  const lt = t - WORKSPACE_CREATED_AT;
  const done = lt >= AGENT_DONE_AFTER;
  const [add, del] = startDiffStat(lt, done);
  const rateLimit = workspace(
    'rl',
    'rate-limit-headers',
    RATE_LIMIT_NAME,
    created && !done ? 'run' : 'branch',
    add,
    del,
    { fresh: true },
  );
  const repos = [
    webRepo(
      ...(created ? [rateLimit] : []),
      darkModeSettings(),
      workspace(
        'ff',
        'fix-flaky-checkout',
        'Fix flaky checkout test',
        'fail',
        23,
        41,
      ),
    ),
    apiRepo(),
  ];
  const keys =
    t > 150 && t < 1000 ? ['⌘', 'N'] : t > 2700 && t < 3500 ? ['↵'] : null;
  if (!created)
    return {
      repos,
      selected: null,
      keys,
      panel: null,
      center: <NewWorkspaceScreen t={t} />,
    };
  return {
    repos,
    selected: 'rl',
    keys,
    panel: { files: KRL_FILES.filter((_, i) => lt > FILE_WRITTEN_AT[i]) },
    center: (
      <>
        <WorkspaceHeader
          name={RATE_LIMIT_NAME}
          branch={RATE_LIMIT_BRANCH}
          action={{ ...CREATE_PR, variant: done ? 'primary' : 'secondary' }}
        />
        <Tabs active="chat" />
        <Chat
          items={RATE_LIMIT_CHAT}
          t={lt}
          running={!done}
          status={agentStatus(lt)}
        />
        <Composer running={!done} />
      </>
    ),
  };
}

interface ParallelWorkspace {
  name: string;
  branch: string;
  port: number;
  chat: ChatItem[];
}

const PARALLEL: Record<string, ParallelWorkspace> = {
  rl: {
    name: RATE_LIMIT_NAME,
    branch: RATE_LIMIT_BRANCH,
    port: 55000,
    chat: [
      { kind: 'user', at: 0, text: RATE_LIMIT_TASK },
      {
        kind: 'tool',
        at: 300,
        tool: 'Read',
        target: 'src/middleware/rateLimit.ts',
      },
      {
        kind: 'tool',
        at: 900,
        tool: 'Edit',
        target: 'src/middleware/rateLimit.ts',
        add: 18,
        del: 4,
      },
      { kind: 'tool', at: 1600, tool: 'Bash', target: 'npm test -- rateLimit' },
      {
        kind: 'tool',
        at: 2600,
        tool: 'Edit',
        target: 'src/middleware/rateLimit.test.ts',
        add: 22,
        del: 8,
      },
    ],
  },
  ff: {
    name: 'Fix flaky checkout test',
    branch: 'thiago/fix-flaky-checkout',
    port: 55010,
    chat: [
      {
        kind: 'user',
        at: 0,
        text: 'The checkout e2e test fails about one run in five. Find out why and fix it.',
      },
      {
        kind: 'tool',
        at: 200,
        tool: 'Bash',
        target: 'npx playwright test checkout --repeat-each=20',
      },
      { kind: 'tool', at: 800, tool: 'Read', target: 'e2e/checkout.spec.ts' },
      {
        kind: 'tool',
        at: 1300,
        tool: 'Edit',
        target: 'e2e/checkout.spec.ts',
        add: 3,
        del: 1,
      },
      {
        kind: 'agent',
        at: 2000,
        body: (
          <>
            The test pressed Pay before the Stripe iframe had loaded. It now
            waits for <code>[data-stripe-ready]</code>. 20 of 20 runs pass.
          </>
        ),
      },
    ],
  },
  dm: {
    name: 'Dark mode settings',
    branch: 'thiago/dark-mode-settings',
    port: 55020,
    chat: [
      {
        kind: 'user',
        at: 0,
        text: 'Add a theme setting to Settings → Appearance: system, light, dark.',
      },
      {
        kind: 'tool',
        at: 300,
        tool: 'Read',
        target: 'src/routes/settings/appearance.tsx',
      },
      {
        kind: 'tool',
        at: 900,
        tool: 'Edit',
        target: 'src/routes/settings/appearance.tsx',
        add: 41,
        del: 6,
      },
      {
        kind: 'tool',
        at: 1500,
        tool: 'Edit',
        target: 'src/theme/useTheme.ts',
        add: 28,
        del: 0,
      },
      {
        kind: 'tool',
        at: 2100,
        tool: 'Bash',
        target: 'npm run dev -- --port $KOREV_PORT',
      },
    ],
  },
  ob: {
    name: 'Onboarding copy',
    branch: 'thiago/onboarding-copy',
    port: 55030,
    chat: [
      {
        kind: 'user',
        at: 0,
        text: (
          <>
            Rewrite the onboarding empty states with the copy in{' '}
            <code>.context/copy.md</code>
          </>
        ),
      },
      { kind: 'tool', at: 300, tool: 'Read', target: '.context/copy.md' },
      {
        kind: 'tool',
        at: 800,
        tool: 'Edit',
        target: 'src/onboarding/EmptyProjects.tsx',
        add: 9,
        del: 12,
      },
      {
        kind: 'tool',
        at: 1300,
        tool: 'Edit',
        target: 'src/onboarding/EmptyTeam.tsx',
        add: 7,
        del: 10,
      },
    ],
  },
};
const PARALLEL_ORDER = ['rl', 'ff', 'dm', 'ob'];
const PARALLEL_SLOT_MS = 2500;
const PARALLEL_CHAT_HEAD_START = 1400;
const PARALLEL_FINISHED: Record<string, [at: number, state: WorkspaceState]> = {
  ff: [3400, 'checks'],
  ob: [8200, 'branch'],
};

function parallelState(id: string, t: number): WorkspaceState {
  const finished = PARALLEL_FINISHED[id];
  return finished && t > finished[0] ? finished[1] : 'run';
}

function sceneParallel(t: number): SceneState {
  const slot = Math.min(3, Math.floor(t / PARALLEL_SLOT_MS));
  const selected = PARALLEL_ORDER[slot];
  const lt = t - slot * PARALLEL_SLOT_MS;
  const w = PARALLEL[selected];
  const running = parallelState(selected, t) === 'run';
  const unread = (id: string) => parallelState(id, t) !== 'run';
  const fixingFlakyTest = selected === 'ff';
  return {
    repos: [
      webRepo(
        workspace(
          'rl',
          'rate-limit-headers',
          RATE_LIMIT_NAME,
          parallelState('rl', t),
          62,
          4,
        ),
        workspace(
          'ff',
          'fix-flaky-checkout',
          'Fix flaky checkout test',
          parallelState('ff', t),
          3,
          1,
          { unread: unread('ff') },
        ),
        workspace(
          'dm',
          'dark-mode-settings',
          'Dark mode settings',
          parallelState('dm', t),
          69,
          6,
        ),
        workspace(
          'ob',
          'onboarding-copy',
          'Onboarding copy',
          parallelState('ob', t),
          16,
          22,
          { unread: unread('ob') },
        ),
      ),
      apiRepo(),
    ],
    selected,
    keys: lt < 800 ? ['⌘', String(slot + 1)] : null,
    panel: {
      files: w.chat.flatMap((c): FileStat[] =>
        c.kind === 'tool' && c.tool === 'Edit'
          ? [[c.target, c.add ?? 0, c.del ?? 0]]
          : [],
      ),
      terminalTab: 'run',
      terminal: [
        ['c', '$ npm run dev -- --port $KOREV_PORT'],
        ['', 'vite v6.2.0  ready in 412 ms'],
        ['ac', `➜  Local: http://localhost:${w.port}/`],
      ],
    },
    center: (
      <>
        <WorkspaceHeader
          name={w.name}
          branch={w.branch}
          pr={fixingFlakyTest ? 477 : null}
          action={
            fixingFlakyTest
              ? { label: 'Fix errors', icon: Wrench, variant: 'danger' }
              : { ...CREATE_PR, variant: 'secondary' }
          }
        />
        <Tabs active="chat" />
        <Chat
          items={w.chat}
          t={lt + PARALLEL_CHAT_HEAD_START}
          running={running}
        />
        <Composer running={running} />
      </>
    ),
  };
}

export const RATE_LIMIT_DIFF: DiffLine[] = [
  {
    type: 'hunk',
    code: '@@ -18,13 +18,17 @@ export function rateLimit(opts: Options)',
  },
  { type: 'ctx', code: '  return async (req, res, next) => {' },
  { type: 'ctx', code: '    const key = tenantKey(req);' },
  { type: 'del', code: '    const ok = await bucket.take(key);' },
  {
    type: 'add',
    code: '    const { ok, remaining, resetAt } = await bucket.take(key);',
  },
  { type: 'add', code: "    res.setHeader('X-RateLimit-Limit', opts.limit);" },
  {
    type: 'add',
    code: "    res.setHeader('X-RateLimit-Remaining', remaining);",
  },
  {
    type: 'add',
    code: "    res.setHeader('X-RateLimit-Reset', Math.ceil(resetAt / 1000));",
  },
  { type: 'ctx', code: '    if (!ok) {' },
  { type: 'del', code: '      return res.status(429).end();' },
  {
    type: 'add',
    code: "      return res.status(429).json({ error: 'rate_limited' });",
  },
  { type: 'ctx', code: '    }' },
  { type: 'ctx', code: '    next();' },
  { type: 'ctx', code: '  };' },
];
export const COMMENTED_DIFF_LINE = 10;

export function ReviewComment({
  author,
  children,
  actions,
}: {
  author: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="km-cbox">
      <div className="who">
        <span className="km-av">T</span>
        {author}
      </div>
      <div className="t">{children}</div>
      {actions && <div className="a">{actions}</div>}
    </div>
  );
}

export const SAVED_COMMENT_AUTHOR = 'You · line 30';

function DraftComment({ t }: { t: number }) {
  const saved = t > 5000;
  const text = typed(REVIEW_COMMENT, t, 2000, 22);
  return (
    <ReviewComment
      author={saved ? SAVED_COMMENT_AUTHOR : 'Comment on this line'}
      actions={
        !saved && (
          <>
            <Button size="sm" variant="ghost" tabIndex={-1}>
              Cancel
            </Button>
            <Press on={t > 4600}>
              <Button size="sm" variant="primary" tabIndex={-1}>
                Comment
              </Button>
            </Press>
          </>
        )
      }
    >
      {text || (
        <span style={{ color: 'var(--fg-4)' }}>
          Leave a comment for the agent
        </span>
      )}
      {!saved && <span className="km-caret" />}
    </ReviewComment>
  );
}

function sceneReview(t: number): SceneState {
  const saved = t > 5000;
  const sent = t > 7800;
  return {
    repos: [
      webRepo(
        workspace(
          'rl',
          'rate-limit-headers',
          RATE_LIMIT_NAME,
          sent ? 'run' : 'branch',
          84,
          12,
        ),
        darkModeSettings(),
        workspace(
          'ff',
          'fix-flaky-checkout',
          'Fix flaky checkout test',
          'checks',
          3,
          1,
        ),
      ),
      apiRepo(),
    ],
    selected: 'rl',
    keys: t > 150 && t < 1000 ? ['⌘', '⇧', 'D'] : null,
    panel: {},
    center: (
      <>
        <WorkspaceHeader
          name={RATE_LIMIT_NAME}
          branch={RATE_LIMIT_BRANCH}
          action={CREATE_PR}
        />
        <Tabs active="changes" />
        <div className="km-difftool">
          <div className="km-seg">
            <span className="on">Unified</span>
            <span>Split</span>
          </div>
          <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>
            3 files · <DiffStat add={84} del={12} />
          </span>
          <span className="km-ml" />
          {saved && (
            <Press
              on={t > 7300 && t < 7900}
              style={{ animation: 'km-in .22s var(--ease-out)' }}
            >
              <Button
                size="sm"
                variant={sent ? 'secondary' : 'primary'}
                icon={sent ? CheckIcon : Send}
                tabIndex={-1}
              >
                {sent ? 'Sent to Claude Code' : '1 comment ready to send'}
              </Button>
            </Press>
          )}
        </div>
        <div className="km-diffwrap">
          <div className="km-fhead">
            <ChevronDown size={13} color="var(--fg-3)" />
            <FileCode2 size={13} color="var(--fg-3)" />
            src/middleware/rateLimit.ts
            <DiffStat add={18} del={4} />
            <span
              className="km-ml"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontFamily: 'var(--font-sans)',
                fontSize: 12,
                color: 'var(--fg-3)',
              }}
            >
              <span
                style={{
                  width: 13,
                  height: 13,
                  border: '1px solid var(--border-2)',
                  borderRadius: 3,
                }}
              />
              Viewed
            </span>
          </div>
          <DiffHunk
            oldStart={18}
            newStart={18}
            lines={RATE_LIMIT_DIFF}
            notes={
              t > 1500 ? { [COMMENTED_DIFF_LINE]: <DraftComment t={t} /> } : {}
            }
          />
        </div>
        {sent && (
          <Toast>
            <MessageSquare size={14} />1 comment sent ·{' '}
            <code style={{ fontSize: 12 }}>rateLimit.ts:30</code>
          </Toast>
        )}
      </>
    ),
  };
}

type CheckRun = [
  name: string,
  finishesAt: number,
  duration: string,
  fails?: boolean,
];

const FIRST_CHECK_RUN_AT = 3500;
const SECOND_CHECK_RUN_AT = 6500;
const FIRST_CHECK_RUN: CheckRun[] = [
  ['typecheck', 600, '38s'],
  ['unit', 1000, '1m 04s'],
  ['lint', 1400, '21s', true],
  ['e2e', 1500, '3m 12s'],
];
const SECOND_CHECK_RUN: CheckRun[] = [
  ['typecheck', 400, '36s'],
  ['lint', 800, '19s'],
  ['unit', 1100, '1m 02s'],
  ['e2e', 1400, '3m 08s'],
];

function checksAt(t: number): Check[] {
  const firstRun = t < SECOND_CHECK_RUN_AT;
  const run = firstRun ? FIRST_CHECK_RUN : SECOND_CHECK_RUN;
  const lt = t - (firstRun ? FIRST_CHECK_RUN_AT : SECOND_CHECK_RUN_AT);
  return run.map(([name, finishesAt, duration, fails]) => {
    if (lt < finishesAt) return [name, 'run', ''];
    return [name, fails ? 'fail' : 'ok', duration];
  });
}

const SHIP_CHECKS_DONE_AT = 8000;
const SHIP_MERGED_AT = 9800;

function shipStep(t: number): [HeaderAction, WorkspaceState] {
  if (t < 1500) return [{ ...CREATE_PR, pressed: t > 1050 }, 'branch'];
  if (t < 3500)
    return [
      { label: 'Creating PR', variant: 'secondary', loading: true },
      'branch',
    ];
  if (t < 5000)
    return [
      { label: 'Checks running', variant: 'secondary', loading: true },
      'checks',
    ];
  if (t < 6500)
    return [
      {
        label: 'Fix errors',
        icon: Wrench,
        variant: 'danger',
        pressed: t > 6050,
      },
      'fail',
    ];
  if (t < SHIP_CHECKS_DONE_AT)
    return [
      { label: 'Checks running', variant: 'secondary', loading: true },
      'checks',
    ];
  if (t < SHIP_MERGED_AT)
    return [
      { label: 'Merge', icon: GitMerge, variant: 'success', pressed: t > 9350 },
      'open',
    ];
  return [{ label: 'Archive', icon: Archive, variant: 'secondary' }, 'merged'];
}

function shipKeys(t: number) {
  if (t > 950 && t < 1700) return ['⌘', '⇧', 'P'];
  if (t > 5950 && t < 6700) return ['⌘', '⇧', 'X'];
  if (t > 9250 && t < 10000) return ['⌘', '⇧', 'M'];
  return null;
}

const SHIP_CHAT: ChatItem[] = [
  {
    kind: 'agent',
    at: -1,
    body: (
      <>
        Every response now sends <code>X-RateLimit-Limit</code>,{' '}
        <code>X-RateLimit-Remaining</code> and <code>X-RateLimit-Reset</code>.
        The 12 rate-limit tests pass.
      </>
    ),
  },
  { kind: 'changes', at: -1, files: 3, add: 84, del: 12 },
  {
    kind: 'user',
    system: true,
    at: 1500,
    text: 'Create a pull request against main.',
  },
  {
    kind: 'tool',
    at: 1900,
    tool: 'Bash',
    target: 'git commit -m "Send rate limit headers on every response"',
  },
  {
    kind: 'tool',
    at: 2400,
    tool: 'Bash',
    target: 'git push -u origin thiago/rate-limit-headers',
  },
  { kind: 'tool', at: 2900, tool: 'Bash', target: 'gh pr create --base main' },
  {
    kind: 'agent',
    at: 3400,
    body: (
      <>
        Opened <code>#482</code> Send rate limit headers on every response.
      </>
    ),
  },
  {
    kind: 'user',
    system: true,
    at: 6500,
    text: (
      <>
        Fix the failing check: lint · <code>rateLimit.ts:24</code>{' '}
        no-unused-vars
      </>
    ),
  },
  {
    kind: 'tool',
    at: 6800,
    tool: 'Edit',
    target: 'src/middleware/rateLimit.ts',
    add: 0,
    del: 1,
  },
  { kind: 'tool', at: 7200, tool: 'Bash', target: 'npm run lint && git push' },
  {
    kind: 'agent',
    at: 7700,
    body: (
      <>
        Removed the unused <code>windowMs</code> import. Lint passes.
      </>
    ),
  },
];

function sceneShip(t: number): SceneState {
  const [action, prState] = shipStep(t);
  const running = (t > 1500 && t < 3400) || (t > 6500 && t < 7700);
  const prOpen = t >= FIRST_CHECK_RUN_AT;
  return {
    repos: [
      webRepo(
        workspace(
          'rl',
          'rate-limit-headers',
          RATE_LIMIT_NAME,
          running ? 'run' : prState,
          84,
          12,
        ),
        darkModeSettings(),
        workspace(
          'ff',
          'fix-flaky-checkout',
          'Fix flaky checkout test',
          'open',
          3,
          1,
        ),
      ),
      apiRepo(),
    ],
    selected: 'rl',
    keys: shipKeys(t),
    panel: prOpen
      ? {
          tab: 'checks',
          pr: { n: 482, state: prState, title: 'Send rate limit headers' },
          checks: checksAt(Math.min(t, SHIP_CHECKS_DONE_AT + 1000)),
        }
      : {},
    center: (
      <>
        <WorkspaceHeader
          name={RATE_LIMIT_NAME}
          branch={RATE_LIMIT_BRANCH}
          pr={prOpen ? 482 : null}
          action={action}
        />
        <Tabs active="chat" />
        <Chat items={SHIP_CHAT} t={t} running={running} />
        <Composer running={running} />
        {t > SHIP_MERGED_AT && t < 11400 && (
          <Toast>
            <GitMerge size={14} color={MERGED_PURPLE} />
            Merged #482 · squash
          </Toast>
        )}
      </>
    ),
  };
}

export const ASK_QUESTION =
  'We want a billing portal. What has to change in web and api?';
const ASK_STARTED_AT = 6900;

function askChat(t: number): ChatItem[] {
  return [
    { kind: 'user', at: 300, text: ASK_QUESTION },
    {
      kind: 'tool',
      at: 1100,
      tool: 'Read',
      target: 'api/src/billing/stripe.ts',
    },
    { kind: 'tool', at: 1600, tool: 'Grep', target: '"customerId" in web/src' },
    {
      kind: 'tool',
      at: 2100,
      tool: 'Read',
      target: 'web/src/routes/settings/index.tsx',
    },
    {
      kind: 'agent',
      at: 3000,
      body: (
        <>
          api creates Stripe customers in <code>createCustomer()</code> but
          never opens a portal session. A plan:
          <ul>
            <li>
              <b>api</b>: add <code>POST /billing/portal</code> that calls{' '}
              <code>stripe.billingPortal.sessions.create</code>.
            </li>
            <li>
              <b>web</b>: add a Billing tab to Settings that requests the
              session and redirects to it.
            </li>
          </ul>
        </>
      ),
    },
    {
      kind: 'custom',
      at: 4600,
      body: (
        <div className="km-askcta">
          <Press on={t > 6300 && t < 7000}>
            <Button
              size="sm"
              variant="primary"
              icon={GitBranchPlus}
              tabIndex={-1}
            >
              Start workspaces
            </Button>
          </Press>
          <span>One linked workspace per repository</span>
        </div>
      ),
    },
  ];
}

export const billingPortal = (id: string) =>
  workspace('bp' + id, 'billing-portal', 'Billing portal', 'run', null, null, {
    linked: true,
    fresh: true,
  });

function sceneAsk(t: number): SceneState {
  const started = t > ASK_STARTED_AT;
  return {
    repos: [
      webRepo(
        ...(started ? [billingPortal('web')] : []),
        workspace(
          'rl',
          'rate-limit-headers',
          RATE_LIMIT_NAME,
          'merged',
          84,
          12,
        ),
        darkModeSettings(),
      ),
      apiRepo(...(started ? [billingPortal('api')] : [])),
    ],
    selected: null,
    askSelected: true,
    askChats:
      t > 800 ? [{ title: 'Billing portal in web and api', ago: 'now' }] : [],
    panel: null,
    keys: null,
    center: (
      <>
        <div className="km-askhead">
          <MessageCircleQuestion size={15} color="var(--fg-3)" />
          <span style={{ fontWeight: 600, color: 'var(--fg-1)' }}>Ask</span>
          <span className="km-repo">
            <FolderGit2 size={12} />
            acme/web
          </span>
          <span className="km-repo">
            <FolderGit2 size={12} />
            acme/api
          </span>
          <span className="km-ro">
            <Eye size={13} />
            Read-only · default branch
          </span>
        </div>
        <Chat
          items={askChat(t)}
          t={t}
          running={t > 300 && t < 3000}
          status="Reading"
        />
        <Composer placeholder="Ask about acme/web and acme/api" />
        {started && t < 9600 && (
          <Toast>
            <Link size={14} />
            Started 2 linked workspaces · thiago/billing-portal
          </Toast>
        )}
      </>
    ),
  };
}

export const SCENES: Scene[] = [
  { id: 'start', label: 'Start a task', duration: 9600, render: sceneStart },
  {
    id: 'parallel',
    label: 'Run in parallel',
    duration: 10000,
    render: sceneParallel,
  },
  {
    id: 'review',
    label: 'Review the diff',
    duration: 9200,
    render: sceneReview,
  },
  { id: 'ship', label: 'Ship it', duration: 11600, render: sceneShip },
  { id: 'ask', label: 'Ask first', duration: 10200, render: sceneAsk },
];
