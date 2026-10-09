import {
  CLAUDE_MODELS,
  DEFAULT_EFFORT,
  EMPTY_SCRIPTS,
  type AgentKind,
  type AppState,
  type AskChat,
  type ChatItem,
  type CheckState,
  type ChatSession,
  type PrStatus,
  type Repo,
  type Settings,
  type Workspace,
  type WorkspaceRuntime,
} from '../../korev-desktop/src/shared/model';

export const NEW_CHAT_TITLE = 'New chat';
export const DEMO_BASE_BRANCH = 'main';
const DEMO_HOME = '/Users/you';
const DEMO_PORT = 3000;
const MINUTE_MS = 60_000;

export const DEMO_REPLY =
  'This is the Korev demo, so no agent is running. With your Mac paired, the agent would now work on this in its own worktree, and you would watch every step here as it happens.';

export const DEMO_DICTATION =
  'Add a loading state to the billing page while the card is saved.';

export const PLAN_REPLY =
  'Here is my plan. Approve it and I will start, or tell me what to change.';

export const PLAN = `## Plan

1. Add the setting to the settings schema, with **system** as the default.
2. Read the setting in the theme provider and follow the system theme when it is unset.
3. Add the picker to Settings → Appearance.
4. Add a test for each of the three choices.`;

export const PLAN_APPROVED_REPLY =
  'Working on the plan now. In the demo nothing is changed; with your Mac paired, the agent edits the code in this workspace.';

export const DENIED_REPLY = 'OK. I will not do that. What should I do instead?';

export function answerReply(choice: string): string {
  return `Going with ${choice}. I am adding the checkout endpoint, the link to the customer portal and a webhook that keeps each customer's plan in sync.`;
}

export function createPrReply(branch: string, number: number): string {
  return `Pushed ${branch} and opened pull request #${number} against ${DEMO_BASE_BRANCH}.`;
}

const WEB: Repo = {
  id: 'demo-repo-web',
  name: 'acme-web',
  path: `${DEMO_HOME}/code/acme-web`,
  defaultBranch: DEMO_BASE_BRANCH,
  scripts: EMPTY_SCRIPTS,
};

const API: Repo = {
  id: 'demo-repo-api',
  name: 'acme-api',
  path: `${DEMO_HOME}/code/acme-api`,
  defaultBranch: DEMO_BASE_BRANCH,
  scripts: EMPTY_SCRIPTS,
};

const SETTINGS: Settings = {
  theme: 'system',
  defaultAgent: 'claude',
  defaultModels: { claude: CLAUDE_MODELS[0].id, codex: '' },
  branchPrefix: '',
  workspacesRoot: `${DEMO_HOME}/korev/workspaces`,
  defaultEffort: DEFAULT_EFFORT,
  defaultPlanMode: false,
  reviewModel: null,
  autoRenameBranches: true,
  deleteBranchOnArchive: false,
  archiveOnMerge: false,
  toolApprovals: false,
  loadout: [],
  snippets: [],
  editor: 'cursor',
  notifications: true,
  notificationSound: true,
  keepAwake: true,
  remoteAccess: true,
  remotePort: 0,
  phoneNotificationsUrl: '',
  dictationLanguage: 'auto',
  windowBounds: null,
  lastSeenVersion: null,
};

export function demoSession(
  id: string,
  title: string,
  createdAt: string,
  agent: AgentKind = 'claude',
): ChatSession {
  return {
    id,
    title,
    agent,
    model: SETTINGS.defaultModels[agent],
    effort: DEFAULT_EFFORT[agent],
    fast: false,
    planMode: false,
    agentSessionId: null,
    forkOnNextTurn: false,
    createdAt,
  };
}

export function demoWorkspace(
  id: string,
  repo: Pick<Repo, 'id' | 'name'>,
  branch: string,
  name: string,
  session: ChatSession,
): Workspace {
  return {
    id,
    repoId: repo.id,
    groupId: null,
    name,
    branch,
    baseBranch: DEMO_BASE_BRANCH,
    path: `${SETTINGS.workspacesRoot}/${repo.name}/${branch}`,
    port: DEMO_PORT,
    createdAt: session.createdAt,
    archivedAt: null,
    restoredAt: null,
    archiveSnapshot: null,
    keepAfterMerge: false,
    sessions: [session],
    prs: [],
  };
}

export function demoRuntime(
  patch: Partial<WorkspaceRuntime> = {},
): WorkspaceRuntime {
  return {
    status: 'idle',
    unread: false,
    stats: null,
    prs: [],
    strayWorktrees: [],
    message: null,
    pendingPrompt: null,
    runUrl: null,
    ...patch,
  };
}

export function demoPullRequest(
  repo: Pick<Repo, 'name'>,
  number: number,
  title: string,
  branch: string,
  createdAt: string,
  patch: Partial<PrStatus> = {},
): PrStatus {
  return {
    number,
    url: `https://github.com/acme/${repo.name}/pull/${number}`,
    title,
    state: 'OPEN',
    isDraft: false,
    mergeable: 'MERGEABLE',
    reviewDecision: 'APPROVED',
    mergedAt: null,
    headRefName: branch,
    baseRefName: DEMO_BASE_BRANCH,
    createdAt,
    checks: demoChecks({
      test: 'success',
      lint: 'success',
      typecheck: 'success',
    }),
    stack: null,
    ...patch,
  };
}

function demoChecks(states: Record<string, CheckState>): PrStatus['checks'] {
  return Object.entries(states).map(([name, state]) => ({
    name,
    state,
    url: null,
    required: true,
  }));
}

function withTrackedPr(workspace: Workspace, pr: PrStatus): Workspace {
  return {
    ...workspace,
    prs: [{ url: pr.url, sessionId: workspace.sessions[0].id }],
  };
}

function conversation(
  idPrefix: string,
  task: string,
  at: string,
  reply: string,
  minutes: number,
): ChatItem[] {
  return [
    user(`${idPrefix}-1`, task, at),
    { id: `${idPrefix}-2`, kind: 'assistant', text: reply },
    finished(`${idPrefix}-3`, minutes),
  ];
}

function user(id: string, text: string, at: string): ChatItem {
  return { id, kind: 'user', text, at, checkpoint: null };
}

function finished(id: string, minutes: number): ChatItem {
  return {
    id,
    kind: 'result',
    ok: true,
    text: '',
    durationMs: minutes * MINUTE_MS,
    costUsd: null,
  };
}

function tool(
  id: string,
  name: string,
  summary: string,
  output: string | null = '',
): ChatItem {
  return {
    id,
    kind: 'tool',
    name,
    summary,
    detail: '',
    output,
    failed: false,
  };
}

export interface DemoWorld {
  state: AppState;
  transcripts: Map<string, ChatItem[]>;
  replies: { sessionId: string; text: string }[];
}

export function demoWorld(now: number): DemoWorld {
  const ago = (minutes: number) =>
    new Date(now - minutes * MINUTE_MS).toISOString();

  const login = demoWorkspace(
    'demo-ws-login',
    WEB,
    'fix-login-redirect',
    'Fix login redirect',
    demoSession('demo-session-login', 'Fix login redirect', ago(200)),
  );
  const billing = demoWorkspace(
    'demo-ws-billing',
    WEB,
    'add-billing-page',
    'Add billing page',
    demoSession('demo-session-billing', 'Add billing page', ago(150)),
  );
  const searchPr = demoPullRequest(
    API,
    87,
    'Speed up search with a trigram index',
    'speed-up-search',
    ago(50),
  );
  const search = withTrackedPr(
    demoWorkspace(
      'demo-ws-search',
      API,
      'speed-up-search',
      'Speed up search',
      demoSession('demo-session-search', 'Speed up search', ago(70)),
    ),
    searchPr,
  );
  const onboardingPr = demoPullRequest(
    WEB,
    79,
    'Rewrite the onboarding copy',
    'onboarding-copy',
    ago(95),
    { state: 'MERGED', mergedAt: ago(30) },
  );
  const onboarding = withTrackedPr(
    demoWorkspace(
      'demo-ws-onboarding',
      WEB,
      'onboarding-copy',
      'Onboarding copy',
      demoSession('demo-session-onboarding', 'Onboarding copy', ago(100)),
    ),
    onboardingPr,
  );
  const webhooksPr = demoPullRequest(
    API,
    91,
    'Retry failed webhooks with backoff',
    'webhook-retries',
    ago(12),
    {
      reviewDecision: null,
      checks: demoChecks({ test: 'pending', lint: 'success' }),
    },
  );
  const webhooks = withTrackedPr(
    demoWorkspace(
      'demo-ws-webhooks',
      API,
      'webhook-retries',
      'Webhook retries',
      demoSession('demo-session-webhooks', 'Webhook retries', ago(90)),
    ),
    webhooksPr,
  );
  const checkoutPr = demoPullRequest(
    API,
    90,
    'Fix the flaky checkout test',
    'fix-flaky-checkout',
    ago(20),
    {
      reviewDecision: null,
      checks: demoChecks({ e2e: 'failure', test: 'success', lint: 'success' }),
    },
  );
  const checkout = withTrackedPr(
    demoWorkspace(
      'demo-ws-checkout',
      API,
      'fix-flaky-checkout',
      'Fix flaky checkout',
      demoSession('demo-session-checkout', 'Fix flaky checkout', ago(40)),
    ),
    checkoutPr,
  );
  const darkMode = demoWorkspace(
    'demo-ws-dark',
    WEB,
    'dark-mode-settings',
    'Dark mode settings',
    demoSession('demo-session-dark', 'Dark mode settings', ago(120)),
  );
  const ask: AskChat = {
    id: 'demo-ask-sessions',
    repoIds: [WEB.id, API.id],
    session: demoSession(
      'demo-session-ask',
      'How are sessions refreshed?',
      ago(180),
    ),
    createdAt: ago(180),
    lastMessageAt: ago(178),
  };

  const state: AppState = {
    repos: [WEB, API],
    folders: [],
    rootOrder: [WEB.id, API.id],
    workspaces: [
      login,
      billing,
      onboarding,
      webhooks,
      search,
      checkout,
      darkMode,
    ],
    askChats: [ask],
    settings: SETTINGS,
    runtime: {
      [login.id]: demoRuntime({ status: 'working' }),
      [billing.id]: demoRuntime({ status: 'waiting', unread: true }),
      [search.id]: demoRuntime({
        stats: { additions: 128, deletions: 14 },
        prs: [searchPr],
      }),
      [onboarding.id]: demoRuntime({
        stats: { additions: 64, deletions: 41 },
        prs: [onboardingPr],
      }),
      [webhooks.id]: demoRuntime({
        stats: { additions: 96, deletions: 14 },
        prs: [webhooksPr],
      }),
      [checkout.id]: demoRuntime({
        stats: { additions: 23, deletions: 9 },
        prs: [checkoutPr],
      }),
      [darkMode.id]: demoRuntime({ stats: { additions: 210, deletions: 38 } }),
    },
    runningSessions: [login.sessions[0].id],
    waitingSessions: [billing.sessions[0].id],
    runningTerminals: [],
    planLimits: {},
    spotlights: {},
    agents: [
      {
        agent: 'claude',
        version: 'demo',
        account: { method: 'demo', email: null, organization: null },
        models: CLAUDE_MODELS,
      },
    ],
    editors: [],
    remote: { address: null, devices: [], loginUrl: null, error: null },
    dictation: { status: 'ready' },
    update: null,
    whatsNew: null,
  };

  const transcripts = new Map<string, ChatItem[]>([
    [
      login.sessions[0].id,
      [
        user(
          'demo-login-1',
          'After signing in, people land on /home instead of the page they came from. Fix it.',
          ago(6),
        ),
        {
          id: 'demo-login-5',
          kind: 'assistant',
          text: 'I will find where the return URL is lost between the sign-in page and the callback.',
        },
        tool('demo-login-2', 'Grep', '"returnTo" in src/auth'),
        tool('demo-login-3', 'Read', 'src/auth/callback.ts'),
        tool('demo-login-6', 'Read', 'src/auth/state.ts'),
        {
          id: 'demo-login-7',
          kind: 'assistant',
          text: 'Found it. The sign-in state keeps only the CSRF token, so the callback has nowhere to send people back to.',
        },
        tool('demo-login-8', 'Edit', 'src/auth/state.ts', null),
        {
          id: 'demo-login-4',
          kind: 'todos',
          todos: [
            { text: 'Find where the return URL is lost', status: 'completed' },
            {
              text: 'Keep the return URL through the sign-in round trip',
              status: 'in_progress',
            },
            { text: 'Add a test', status: 'pending' },
          ],
        },
      ],
    ],
    [
      billing.sessions[0].id,
      [
        user(
          'demo-billing-1',
          'Add a billing page where customers can change their plan and update their card.',
          ago(3),
        ),
        {
          id: 'demo-billing-2',
          kind: 'assistant',
          text: 'The page and the plan picker are in place. Before I connect payments, I need one decision from you.',
        },
        {
          id: 'demo-billing-3',
          kind: 'permission',
          tool: 'AskUserQuestion',
          summary: 'Which payment provider should I use?',
          detail: '',
          plan: null,
          status: 'pending',
          questions: [
            {
              question: 'Which payment provider should I use?',
              header: 'Provider',
              multiSelect: false,
              options: [
                {
                  label: 'Stripe',
                  description:
                    'Stripe Checkout and the Stripe customer portal.',
                },
                {
                  label: 'Paddle',
                  description:
                    'Paddle is the merchant of record, so it handles sales tax.',
                },
              ],
            },
          ],
        },
      ],
    ],
    [
      search.sessions[0].id,
      [
        user(
          'demo-search-1',
          'Search takes two seconds on large accounts. Make it fast.',
          ago(70),
        ),
        tool('demo-search-2', 'Edit', 'db/migrations/add_trigram_index.sql'),
        tool('demo-search-3', 'Bash', 'npm run bench:search'),
        {
          id: 'demo-search-4',
          kind: 'assistant',
          text: 'Added a trigram index on the searched columns and changed the query to use it. On the benchmark, p95 went from 1.9 s to 120 ms. I opened #87.',
        },
        finished('demo-search-5', 4),
      ],
    ],
    [
      darkMode.sessions[0].id,
      [
        user(
          'demo-dark-1',
          'Add a theme setting to Settings → Appearance: system, light, dark.',
          ago(120),
        ),
        tool('demo-dark-2', 'Edit', 'src/settings/Appearance.tsx'),
        {
          id: 'demo-dark-3',
          kind: 'assistant',
          text: 'Done. The setting defaults to system, and the app follows the system theme until you pick one. Tests pass.',
        },
        finished('demo-dark-4', 3),
      ],
    ],
    [
      onboarding.sessions[0].id,
      conversation(
        'demo-onboarding',
        'Rewrite the onboarding copy so each step says what the person gets, not what they must do.',
        ago(100),
        'Rewrote the five onboarding steps. Each title now names the result, and the buttons use the same verbs as the steps. #79 is merged.',
        6,
      ),
    ],
    [
      webhooks.sessions[0].id,
      conversation(
        'demo-webhooks',
        'Retry failed webhook deliveries with exponential backoff, up to 5 times.',
        ago(90),
        'Failed deliveries now retry after 1, 2, 4, 8 and 16 minutes. After the fifth failure the delivery is marked as dead and shows in the dashboard. I opened #91.',
        9,
      ),
    ],
    [
      checkout.sessions[0].id,
      conversation(
        'demo-checkout',
        'The checkout e2e test fails about one run in five. Find out why and fix it.',
        ago(40),
        'The test clicked Pay before the card form finished loading. It now waits for the form to be ready. I opened #90, but e2e still fails on CI, so there is one more cause to find.',
        7,
      ),
    ],
    [
      ask.session.id,
      [
        user('demo-ask-1', 'How are sessions refreshed?', ago(180)),
        {
          id: 'demo-ask-2',
          kind: 'assistant',
          text: 'acme-web keeps a short-lived access token in memory and a refresh token in an httpOnly cookie. When a request gets a 401, `apiClient` calls `POST /auth/refresh` on acme-api once, stores the new access token and retries the request.',
        },
        finished('demo-ask-3', 1),
      ],
    ],
  ]);

  return {
    state,
    transcripts,
    replies: [
      {
        sessionId: login.sessions[0].id,
        text: 'The return URL was lost in callback.ts, because the sign-in state only kept the CSRF token. The state now carries the return path too, and the callback checks that the path is on our own site before it redirects. I added a test for both cases.',
      },
    ],
  };
}
