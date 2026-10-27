import { describe, expect, it, vi } from 'vitest';
import type { ChatItem, Result, Workspace } from '../shared/model';
import type { CommandResult } from './command-runner';
import type { Context } from './context';
import { defaultSettings } from './store';
import {
  announcement,
  createVoiceCommands,
  type VoiceCommand,
} from './voice-commands';

const OK: Result = { ok: true, value: undefined };

function workspace(name: string): Workspace {
  return {
    id: `${name}-ws`,
    repoId: 'repo',
    groupId: null,
    name,
    label: null,
    branch: name,
    baseBranch: 'main',
    path: `/work/${name}`,
    port: 0,
    createdAt: '',
    archivedAt: null,
    restoredAt: null,
    archiveSnapshot: null,
    keepAfterMerge: false,
    awaitsLane: false,
    prs: [],
    sessions: [
      {
        id: `${name}-chat`,
        title: name,
        agent: 'claude',
        model: 'claude-model',
        effort: 'high',
        fast: false,
        planMode: false,
        agentSessionId: null,
        forkOnNextTurn: false,
        createdAt: '',
      },
    ],
  };
}

const QUESTION: ChatItem = {
  id: 'question-1',
  kind: 'permission',
  tool: 'AskUserQuestion',
  summary: '',
  detail: '',
  questions: [
    {
      question: 'Which database?',
      header: 'Database',
      multiSelect: false,
      options: [
        { label: 'Postgres', description: '' },
        { label: 'SQLite', description: '' },
      ],
    },
  ],
  plan: null,
  status: 'pending',
};

const PLAN: ChatItem = {
  ...QUESTION,
  id: 'plan-1',
  tool: 'ExitPlanMode',
  questions: null,
  plan: '1. Add the login page',
};

function haikuSays(command: VoiceCommand): CommandResult {
  return {
    exitCode: 0,
    stdout: JSON.stringify({ structured_output: command }),
    stderr: '',
  };
}

function setup(transcripts: Record<string, ChatItem[]> = {}) {
  const state = {
    repos: [{ id: 'repo', name: 'korev' }],
    workspaces: [workspace('login'), workspace('billing')],
    settings: defaultSettings('/home'),
  };
  const run = vi.fn(async (): Promise<CommandResult> => {
    throw new Error('Haiku was not expected to run');
  });
  const emit = vi.fn();
  const ctx = {
    store: { state },
    focusedWorkspaceIds: [],
    runningSessions: new Set<string>(),
    runtime: () => ({ status: 'idle', unread: false }),
    deps: { run, emit, env: {} },
  } as unknown as Context;
  const actions = {
    transcript: async (sessionId: string) => transcripts[sessionId] ?? [],
    waitingSessions: () => Object.keys(transcripts),
    isRunning: () => false,
    createWorkspaces: vi.fn(async () => ({
      ok: true as const,
      value: [workspace('hands-free')],
    })),
    send: vi.fn(async () => OK),
    respondPermission: vi.fn(async () => OK),
    approvePlan: vi.fn(async () => OK),
    stop: vi.fn(async () => undefined),
  };
  const voice = createVoiceCommands(ctx, actions);
  const reply = (command: VoiceCommand) =>
    run.mockResolvedValueOnce(haikuSays(command));
  return { voice, actions, run, emit, reply };
}

describe('announcement', () => {
  it('reads a question with numbered options', () => {
    expect(announcement('login', { kind: 'permission', item: QUESTION })).toBe(
      'login asks: Which database? Option 1, Postgres. Option 2, SQLite.',
    );
  });

  it.each([
    [{ kind: 'permission' as const, item: PLAN }, 'login has a plan ready.'],
    [{ kind: 'plan' as const }, 'login has a plan ready.'],
    [{ kind: 'finished' as const }, 'login finished.'],
    [{ kind: 'failed' as const }, 'login failed.'],
  ])('says %j', (attention, spoken) => {
    expect(announcement('login', attention)).toBe(spoken);
  });
});

describe('createVoiceCommands', () => {
  it('stays quiet and skips Haiku when nobody said the wake word', async () => {
    const { voice, run } = setup();

    expect(await voice.run('pass me the ammo')).toEqual({ reply: '' });
    expect(run).not.toHaveBeenCalled();
  });

  it('starts listening for the command when only the wake word is said', async () => {
    const { voice, run } = setup();

    expect(await voice.run('Korev.')).toEqual({ reply: '', listening: true });
    expect(run).not.toHaveBeenCalled();
  });

  it('runs a command said right after the wake word when it is awake', async () => {
    const { voice, reply } = setup();
    reply({
      action: 'open',
      workspaceId: 'billing-ws',
      reply: 'Opening billing',
    });

    expect(await voice.run('open billing', { awake: true })).toEqual({
      reply: 'Opening billing',
      openWorkspaceId: 'billing-ws',
    });
  });

  it('creates a workspace in the repo it names, with the default agent', async () => {
    const { voice, actions, reply } = setup();
    reply({
      action: 'create_workspace',
      repoId: 'repo',
      text: 'Plan a feature to make Korev hands free',
      planMode: true,
      reply: 'Creating a planning workspace in korev',
    });

    const answer = await voice.run(
      'Korev, create a new workspace on the korev repo so we can plan a feature to make korev hands free',
    );

    expect(answer.reply).toBe('Creating a planning workspace in korev');
    expect(actions.createWorkspaces).toHaveBeenCalledWith(
      ['repo'],
      expect.objectContaining({
        text: 'Plan a feature to make Korev hands free',
        planMode: true,
        agent: 'claude',
      }),
    );
  });

  it('answers the question a workspace is waiting on', async () => {
    const { voice, actions, run, reply } = setup({ 'login-chat': [QUESTION] });
    reply({
      action: 'reply',
      workspaceId: 'login-ws',
      text: '',
      answers: { 'Which database?': ['SQLite'] },
      reply: 'Answered SQLite',
    });

    await voice.run('Korev, option two');

    expect(JSON.stringify(run.mock.calls[0])).toContain('Which database?');
    expect(actions.send).toHaveBeenCalledWith(
      'login-chat',
      expect.objectContaining({
        text: '',
        answers: { 'Which database?': ['SQLite'] },
      }),
    );
  });

  it('approves the plan of the workspace it last announced', async () => {
    const { voice, actions, reply, emit } = setup({ 'login-chat': [PLAN] });
    voice.announce(workspace('login'), { kind: 'permission', item: PLAN });
    reply({ action: 'approve', reply: 'Approved' });

    await voice.run('Korev, approve it');

    expect(emit).toHaveBeenCalledWith('announce', {
      workspaceId: 'login-ws',
      text: 'login has a plan ready.',
    });
    expect(actions.respondPermission).toHaveBeenCalledWith(
      'login-chat',
      'plan-1',
      { allow: true },
    );
  });

  it('says why an action failed', async () => {
    const { voice, actions, reply } = setup({ 'login-chat': [PLAN] });
    actions.respondPermission.mockResolvedValueOnce({
      ok: false,
      message: 'This request is no longer waiting for an answer',
    });
    reply({ action: 'approve', workspaceId: 'login-ws', reply: 'Approved' });

    expect(await voice.run('Korev, approve login')).toEqual({
      reply: 'This request is no longer waiting for an answer',
    });
  });

  it('says it did not understand when Haiku fails', async () => {
    const { voice, run } = setup();
    run.mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: 'boom' });

    expect(await voice.run('Korev, do the thing')).toEqual({
      reply: "Sorry, I didn't get that.",
    });
  });
});
