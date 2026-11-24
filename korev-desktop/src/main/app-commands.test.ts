import { describe, expect, it, vi } from 'vitest';
import type {
  AskChat,
  ChatSession,
  Repo,
  Result,
  SendOptions,
  Workspace,
} from '../shared/model';
import { USER_CLI_SESSION } from './agent-server';
import { createAppCommands } from './app-commands';
import type { Context } from './context';

const OK: Result = { ok: true, value: undefined };

function session(id: string, title: string): ChatSession {
  return {
    id,
    title,
    agent: 'claude',
    model: 'claude-model',
    effort: 'high',
    fast: false,
    planMode: false,
    agentSessionId: null,
    forkOnNextTurn: false,
    createdAt: '',
  };
}

function askChat(id: string, extra: Partial<AskChat> = {}): AskChat {
  return {
    id,
    repoIds: ['repo'],
    session: session(`${id}-chat`, id),
    createdAt: '',
    lastMessageAt: '',
    ...extra,
  };
}

function setup(repoNames = ['web']) {
  const korevChat = askChat('korev', { repoIds: [], korev: true });
  const reviews = [
    askChat('review-1', { reviewOf: 'https://github.com/acme/web/pull/1' }),
    askChat('review-2', { reviewOf: 'https://github.com/acme/web/pull/2' }),
  ];
  const archived = askChat('review-old', {
    reviewOf: 'https://github.com/acme/web/pull/0',
    archivedAt: '2026-01-01',
  });
  const workspace = {
    id: 'ws',
    name: 'billing',
    label: null,
    archivedAt: null,
    sessions: [session('ws-chat', 'Fix billing')],
  } as unknown as Workspace;
  const repos = repoNames.map((name) => ({ id: `${name}-id`, name }) as Repo);
  const settings = {
    defaultAgent: 'claude',
    defaultModels: { claude: 'claude-model' },
    defaultEffort: { claude: 'high' },
    defaultPlanMode: true,
  };
  const state = {
    repos,
    settings,
    workspaces: [workspace],
    askChats: [korevChat, ...reviews, archived, askChat('question')],
  };
  const ctx = { store: { state } } as unknown as Context;
  const running = new Set<string>();
  const waiting: string[] = [];
  const stopped: string[] = [];
  const sent: { sessionId: string; text: string; fromKorev: boolean }[] = [];
  const rerun: string[] = [];
  const created: { repoIds: string[]; task: SendOptions }[] = [];
  const workspaceCli = vi.fn(async () => ({ ok: true, output: 'workspace' }));
  const commands = createAppCommands({
    ctx,
    workspaceCli,
    isRunning: (sessionId) => running.has(sessionId),
    waitingSessions: () => waiting,
    send: async (session, text, fromKorev) => {
      sent.push({ sessionId: session.id, text, fromKorev });
      return OK;
    },
    stop: async (sessionId) => {
      stopped.push(sessionId);
    },
    createWorkspaces: (repoIds, task) => {
      created.push({ repoIds, task });
      return { ok: true, value: [workspace] };
    },
    rerunReview: async (ask) => {
      rerun.push(ask.id);
      return OK;
    },
  });
  const cli = (...argv: string[]) =>
    commands.runCli({ sessionId: korevChat.session.id, argv });
  const userCli = (...argv: string[]) =>
    commands.runCli({ sessionId: USER_CLI_SESSION, argv });
  return {
    commands,
    cli,
    userCli,
    running,
    waiting,
    stopped,
    sent,
    rerun,
    created,
    workspaceCli,
  };
}

describe('Korev chat commands', () => {
  it('lists only the open review chats', async () => {
    const { cli } = setup();

    const listed = await cli('chats', 'list', '--reviews');

    expect(listed.ok).toBe(true);
    const lines = listed.output.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('review-1-chat');
    expect(lines[0]).toContain('https://github.com/acme/web/pull/1');
    expect(lines[1]).toContain('review-2-chat');
  });

  it('lists workspace chats and ask chats but not itself', async () => {
    const { cli } = setup();

    const { output } = await cli('chats', 'list');

    expect(output).toContain('ws-chat');
    expect(output).toContain('billing');
    expect(output).toContain('question-chat');
    expect(output).not.toContain('korev-chat');
  });

  it('sends a message to another chat', async () => {
    const { cli, sent } = setup();

    const reply = await cli('chats', 'send', '--id', 'ws-chat', '--body', 'go');

    expect(reply.ok).toBe(true);
    expect(sent).toEqual([
      { sessionId: 'ws-chat', text: 'go', fromKorev: true },
    ]);
  });

  it('refuses to send to an archived chat or one waiting for the user', async () => {
    const { cli, waiting, sent } = setup();
    waiting.push('ws-chat');

    const archived = await cli(
      'chats',
      'send',
      '--id',
      'review-old-chat',
      '--body',
      'go',
    );
    const blocked = await cli(
      'chats',
      'send',
      '--id',
      'ws-chat',
      '--body',
      'go',
    );

    expect(archived.ok).toBe(false);
    expect(blocked.ok).toBe(false);
    expect(sent).toEqual([]);
  });

  it('stops only a chat that is running', async () => {
    const { cli, running, stopped } = setup();
    running.add('ws-chat');

    await cli('chats', 'stop', '--id', 'ws-chat');
    const idle = await cli('chats', 'stop', '--id', 'question-chat');

    expect(stopped).toEqual(['ws-chat']);
    expect(idle.output).toContain('not running');
  });

  it('re-runs a review, and refuses one that is still running', async () => {
    const { cli, running, rerun } = setup();
    running.add('review-2-chat');

    const first = await cli('review', 'rerun', '--id', 'review-1-chat');
    const second = await cli('review', 'rerun', '--id', 'review-2-chat');

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(rerun).toEqual(['review-1']);
  });

  it('refuses to re-run a chat that is not a review', async () => {
    const { cli, rerun } = setup();

    const reply = await cli('review', 'rerun', '--id', 'question-chat');

    expect(reply.ok).toBe(false);
    expect(rerun).toEqual([]);
  });

  it('passes korev commands from other chats to the workspace commands', async () => {
    const { commands, workspaceCli, sent } = setup();
    const call = {
      sessionId: 'ws-chat',
      argv: ['chats', 'send', '--id', 'review-1-chat', '--body', 'hi'],
    };

    const reply = await commands.runCli(call);

    expect(reply.output).toBe('workspace');
    expect(workspaceCli).toHaveBeenCalledWith(call);
    expect(sent).toEqual([]);
  });

  it('lets the user send to a chat that is waiting for them', async () => {
    const { userCli, waiting, sent, workspaceCli } = setup();
    waiting.push('ws-chat');

    const reply = await userCli(
      'chats',
      'send',
      '--id',
      'ws-chat',
      '--body',
      'yes',
    );

    expect(reply.ok).toBe(true);
    expect(sent).toEqual([
      { sessionId: 'ws-chat', text: 'yes', fromKorev: false },
    ]);
    expect(workspaceCli).not.toHaveBeenCalled();
  });

  it('creates a workspace in the only repository with the default plan mode', async () => {
    const { userCli, created } = setup();

    const reply = await userCli('new', '--task', 'Fix the login page');

    expect(reply.output).toContain('ws-chat');
    expect(created).toEqual([
      {
        repoIds: ['web-id'],
        task: expect.objectContaining({
          text: 'Fix the login page',
          planMode: true,
        }),
      },
    ]);
  });

  it('creates a workspace in the repository named by --repo', async () => {
    const { userCli, created } = setup(['web', 'api']);

    await userCli('new', '--task', 'Add a route', '--repo', 'api');

    expect(created[0].repoIds).toEqual(['api-id']);
  });

  it('asks for --repo when there are several repositories', async () => {
    const { userCli, created } = setup(['web', 'api']);

    const reply = await userCli('new', '--task', 'Add a route');

    expect(reply.ok).toBe(false);
    expect(reply.output).toContain('web, api');
    expect(created).toEqual([]);
  });

  it('does not let the Ask Korev chat create workspaces', async () => {
    const { cli, created } = setup();

    const reply = await cli('new', '--task', 'Fix the login page');

    expect(reply.output).toContain('Unknown command');
    expect(created).toEqual([]);
  });
});
