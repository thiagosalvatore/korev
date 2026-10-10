import { describe, expect, it } from 'vitest';
import {
  CLAUDE_MODELS,
  type AgentAvailability,
  type AgentKind,
} from '../shared/model';
import {
  AGENTS,
  detectAgents,
  reconcileDefaultModels,
  type TurnRequest,
} from './agents';
import {
  CommandNotFoundError,
  type CommandResult,
  type CommandRunner,
} from './command-runner';

const REQUEST: TurnRequest = {
  model: 'model',
  planMode: false,
  readOnly: false,
  effort: 'high',
  fast: false,
  toolApprovals: false,
  resumeId: 'chat-1',
  fork: true,
  newSessionId: 'chat-2',
  systemPrompt: '',
  addDirs: [],
};

describe('forking a chat', () => {
  it.each<[AgentKind, string[]]>([
    ['claude', ['--resume', 'chat-1', '--fork-session']],
    ['codex', ['exec', 'fork']],
  ])('%s continues a copy of the conversation', (agent, expected) => {
    const args = AGENTS[agent].args(REQUEST).join(' ');

    expect(args).toContain(expected.join(' '));
    expect(args).toContain('chat-1');
  });
});

describe('codex sandbox', () => {
  it('lets workspace chats reach the network', () => {
    expect(AGENTS.codex.args(REQUEST)).toContain(
      'sandbox_workspace_write.network_access=true',
    );
  });

  it.each([null, 'chat-1'])(
    'lets workspace chats write the extra dirs (resume: %s)',
    (resumeId) => {
      const args = AGENTS.codex.args({
        ...REQUEST,
        resumeId,
        addDirs: ['/repo/.git', '/attachments'],
      });

      expect(args).toContain(
        'sandbox_workspace_write.writable_roots=["/repo/.git","/attachments"]',
      );
    },
  );

  it.each([
    { planMode: true, readOnly: false },
    { planMode: false, readOnly: true },
  ])('lets read-only chats reach the network (%o)', (mode) => {
    const args = AGENTS.codex.args({ ...REQUEST, ...mode });

    expect(args).toContain('sandbox_mode="read-only"');
    expect(args).toContain('permissions.korev-read-only.network.enabled=true');
  });
});

type Responses = Record<string, Partial<CommandResult>>;

function runnerWith(responses: Responses): CommandRunner {
  return async (file, args) => {
    const response = responses[`${file} ${args.join(' ')}`];
    if (!response) throw new CommandNotFoundError(file);
    return { exitCode: 0, stdout: '', stderr: '', ...response };
  };
}

const CLAUDE_INSTALLED = {
  'claude --version': { stdout: '2.1.0 (Claude Code)' },
};
const CLAUDE_SIGNED_IN = {
  ...CLAUDE_INSTALLED,
  'claude auth status': {
    stdout: JSON.stringify({
      loggedIn: true,
      authMethod: 'claude.ai',
      email: 'ada@example.com',
      orgName: 'Ada Org',
    }),
  },
};
const CODEX_SIGNED_IN = {
  'codex --version': { stdout: 'codex-cli 0.50.0' },
  'codex login status': { stderr: 'Logged in using ChatGPT' },
  'codex debug models': {
    stdout: JSON.stringify({
      models: [
        {
          slug: 'gpt-mini',
          display_name: 'GPT Mini',
          priority: 2,
          visibility: 'list',
        },
        {
          slug: 'gpt-max',
          display_name: 'GPT Max',
          priority: 1,
          visibility: 'list',
        },
      ],
    }),
  },
};

function detected(agents: AgentAvailability[], agent: AgentKind) {
  return agents.find((entry) => entry.agent === agent);
}

describe('detectAgents', () => {
  it('lists no models for an agent that is not installed', async () => {
    const agents = await detectAgents(runnerWith(CLAUDE_SIGNED_IN), {});

    expect(detected(agents, 'codex')).toMatchObject({
      version: null,
      account: null,
      models: [],
    });
  });

  it('lists no models for an agent that is not signed in', async () => {
    const agents = await detectAgents(
      runnerWith({
        ...CLAUDE_INSTALLED,
        'claude auth status': {
          exitCode: 1,
          stdout: JSON.stringify({ loggedIn: false }),
        },
      }),
      {},
    );

    expect(detected(agents, 'claude')).toMatchObject({
      version: '2.1.0',
      account: null,
      models: [],
    });
  });

  it('reads the account and models of signed-in agents', async () => {
    const agents = await detectAgents(
      runnerWith({ ...CLAUDE_SIGNED_IN, ...CODEX_SIGNED_IN }),
      {},
    );

    expect(detected(agents, 'claude')).toMatchObject({
      account: {
        method: 'claude.ai',
        email: 'ada@example.com',
        organization: 'Ada Org',
      },
      models: CLAUDE_MODELS,
    });
    expect(detected(agents, 'codex')).toMatchObject({
      account: { method: 'ChatGPT', email: null, organization: null },
      models: [
        { id: 'gpt-max', label: 'GPT Max' },
        { id: 'gpt-mini', label: 'GPT Mini' },
      ],
    });
  });
});

describe('reconcileDefaultModels', () => {
  const READY: AgentAvailability[] = [
    {
      agent: 'claude',
      version: '2.1.0',
      account: { method: 'claude.ai', email: null, organization: null },
      models: CLAUDE_MODELS,
    },
    {
      agent: 'codex',
      version: '0.50.0',
      account: { method: 'ChatGPT', email: null, organization: null },
      models: [
        { id: 'gpt-max', label: 'GPT Max' },
        { id: 'gpt-mini', label: 'GPT Mini' },
      ],
    },
  ];

  it('picks the first model when the saved one is not offered', () => {
    expect(
      reconcileDefaultModels({ claude: CLAUDE_MODELS[1].id, codex: '' }, READY),
    ).toEqual({ claude: CLAUDE_MODELS[1].id, codex: 'gpt-max' });
  });

  it('leaves agents that are not ready alone', () => {
    const notReady = READY.map((entry) => ({
      ...entry,
      account: null,
      models: [],
    }));

    expect(
      reconcileDefaultModels({ claude: 'gone', codex: '' }, notReady),
    ).toEqual({
      claude: 'gone',
      codex: '',
    });
  });
});

describe('codex model flag', () => {
  it('lets codex use its own default when no model is chosen', () => {
    expect(AGENTS.codex.args({ ...REQUEST, model: '' })).not.toContain(
      '--model',
    );
  });
});
