import { describe, expect, it, vi } from 'vitest';
import type { AskChat, ChatSession, Result, Workspace } from '../shared/model';
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

function setup() {
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
  const state = {
    workspaces: [workspace],
    askChats: [korevChat, ...reviews, archived, askChat('question')],
  };
  const ctx = { store: { state } } as unknown as Context;
  const running = new Set<string>();
  const waiting: string[] = [];
  const stopped: string[] = [];
  const sent: { sessionId: string; text: string }[] = [];
  const rerun: string[] = [];
  const workspaceCli = vi.fn(async () => ({ ok: true, output: 'workspace' }));
  const commands = createAppCommands({
    ctx,
    workspaceCli,
    isRunning: (sessionId) => running.has(sessionId),
    waitingSessions: () => waiting,
    send: async (session, text) => {
      sent.push({ sessionId: session.id, text });
      return OK;
    },
    stop: async (sessionId) => {
      stopped.push(sessionId);
    },
    rerunReview: async (ask) => {
      rerun.push(ask.id);
      return OK;
    },
  });
  const cli = (...argv: string[]) =>
    commands.runCli({ sessionId: korevChat.session.id, argv });
  return {
    commands,
    cli,
    running,
    waiting,
    stopped,
    sent,
    rerun,
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
    expect(sent).toEqual([{ sessionId: 'ws-chat', text: 'go' }]);
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
});
