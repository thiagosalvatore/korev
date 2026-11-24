import type {
  AskChat,
  ChatSession,
  Result,
  SendOptions,
  Workspace,
} from '../shared/model';
import { workspaceLabel } from '../shared/workspaces';
import {
  USER_CLI_SESSION,
  type CliCall,
  type CliHandler,
  type CliReply,
} from './agent-server';
import type { Context } from './context';
import { defaultTask } from './workspaces';
import {
  CliError,
  done,
  failed,
  flags,
  repoNamed,
  required,
  runCommand,
  type Command,
} from './orchestration';

const KOREV_CHAT_GUIDE = `korev: act on the other chats in Korev.

  korev chats list [--reviews]
      One line per open chat: its id, whether it is running, waiting for the
      user or idle, its title, and its workspace or the pull request it
      reviews. --reviews lists only the review chats.
  korev chats send --id <chat id> --body "<text>"
      Send a message to a chat. If the chat is running, the message reaches
      it during or after its turn. A chat that is waiting for the user is
      refused: tell the user instead.
  korev chats stop --id <chat id>
      Stop a running chat.
  korev review rerun --id <chat id>
      Ask a review chat to check its open pull request again: the commits
      since its last review and the author's replies. A review chat that is
      still running is refused.
`;

const USER_GUIDE = `korev: act on your chats in Korev from your own terminal.
Korev must be open.

  korev chats list [--reviews]
      One line per open chat: its id, whether it is running, waiting for you
      or idle, its title, and its workspace or the pull request it reviews.
      --reviews lists only the review chats.
  korev chats send --id <chat id> --body "<text>"
      Send a message to a chat, the same as typing it in the chat.
  korev chats stop --id <chat id>
      Stop a running chat.
  korev review rerun --id <chat id>
      Ask a review chat to check its open pull request again. A review chat
      that is still running is refused.
  korev new --task "<task>" [--repo <repository name>]
      Create a workspace and start its agent on the task, with your default
      agent and plan mode. --repo may be left out when Korev has only one
      repository.
`;

const ASK_CHAT_PLACE = 'ask chat';
const NO_CHATS = 'No open chats.';
const NO_REPOS = 'Add a repository in Korev first.';

export interface AppCommandDeps {
  ctx: Context;
  workspaceCli: CliHandler;
  isRunning(sessionId: string): boolean;
  waitingSessions(): string[];
  send(session: ChatSession, text: string, fromKorev: boolean): Promise<Result>;
  stop(sessionId: string): Promise<void>;
  rerunReview(ask: AskChat): Promise<Result>;
  createWorkspaces(repoIds: string[], task: SendOptions): Result<Workspace[]>;
}

interface OpenChat {
  session: ChatSession;
  place: string;
  ask?: AskChat;
}

function replyOf(result: Result, success: string): CliReply {
  return result.ok ? done(success) : failed(result.message);
}

export function createAppCommands(deps: AppCommandDeps) {
  const state = () => deps.ctx.store.state;

  function isKorevChat(sessionId: string) {
    return state().askChats.some(
      (ask) => ask.korev && ask.session.id === sessionId,
    );
  }

  function openChats(): OpenChat[] {
    const inWorkspaces = state()
      .workspaces.filter((workspace) => !workspace.archivedAt)
      .flatMap((workspace) =>
        workspace.sessions
          .filter((session) => !session.explainer)
          .map((session) => ({
            session,
            place: workspaceLabel(workspace),
          })),
      );
    const asks = state()
      .askChats.filter(
        (ask) =>
          !ask.archivedAt &&
          !ask.korev &&
          !ask.automationRun &&
          !ask.session.explainer,
      )
      .map((ask) => ({
        session: ask.session,
        place: ask.reviewOf ? `reviews ${ask.reviewOf}` : ASK_CHAT_PLACE,
        ask,
      }));
    return [...inWorkspaces, ...asks];
  }

  function chatById(id: string): OpenChat {
    const chat = openChats().find((entry) => entry.session.id === id);
    if (!chat)
      throw new CliError(
        `No open chat has the id ${id}. Run \`korev chats list\`.`,
      );
    return chat;
  }

  function stateOf(session: ChatSession, waiting: Set<string>) {
    if (deps.isRunning(session.id)) return 'running';
    return waiting.has(session.id) ? 'waiting for the user' : 'idle';
  }

  function chatLine(chat: OpenChat, waiting: Set<string>) {
    const { session, place } = chat;
    return `${session.id} [${stateOf(session, waiting)}] ${session.title} - ${place}`;
  }

  function sendCommand(fromKorev: boolean): Command {
    return async (_call, args) => {
      const values = flags(args, { id: 'string', body: 'string' });
      const { session } = chatById(required(values.id, 'id'));
      if (fromKorev && deps.waitingSessions().includes(session.id))
        throw new CliError(
          `${session.title} is waiting for the user to answer it. Tell the user instead.`,
        );
      const body = required(values.body, 'body');
      const sent = await deps.send(session, body, fromKorev);
      return replyOf(sent, `Sent to ${session.title}.`);
    };
  }

  const chatCommands: Record<string, Command> = {
    'chats list': async (_call, args) => {
      const values = flags(args, { reviews: 'boolean' });
      const waiting = new Set(deps.waitingSessions());
      const chats = openChats().filter(
        (chat) => !values.reviews || chat.ask?.reviewOf,
      );
      if (!chats.length) return done(NO_CHATS);
      return done(chats.map((chat) => chatLine(chat, waiting)).join('\n'));
    },

    'chats stop': async (_call, args) => {
      const values = flags(args, { id: 'string' });
      const { session } = chatById(required(values.id, 'id'));
      if (!deps.isRunning(session.id))
        return done(`${session.title} is not running.`);
      await deps.stop(session.id);
      return done(`Stopped ${session.title}.`);
    },

    'review rerun': async (_call, args) => {
      const values = flags(args, { id: 'string' });
      const { session, ask } = chatById(required(values.id, 'id'));
      if (!ask?.reviewOf)
        throw new CliError(`${session.title} is not a review chat.`);
      if (deps.isRunning(session.id))
        throw new CliError(
          `${session.title} is still running. Run this again after its turn ends.`,
        );
      const rerun = await deps.rerunReview(ask);
      return replyOf(rerun, `Started a new review in ${session.title}.`);
    },
  };

  function repoFor(name: string | undefined): string {
    const named = repoNamed(deps.ctx, name);
    if (named) return named;
    const { repos } = state();
    if (repos.length === 1) return repos[0].id;
    if (!repos.length) throw new CliError(NO_REPOS);
    const names = repos.map((repo) => repo.name).join(', ');
    throw new CliError(`Pick a repository with --repo: ${names}.`);
  }

  const newWorkspace: Command = async (_call, args) => {
    const values = flags(args, { task: 'string', repo: 'string' });
    const text = required(values.task, 'task');
    const task = defaultTask(deps.ctx, text, state().settings.defaultPlanMode);
    const created = deps.createWorkspaces([repoFor(values.repo)], task);
    if (!created.ok) return failed(created.message);
    const [workspace] = created.value;
    return done(
      `Created ${workspaceLabel(workspace)}. Its chat id is ${workspace.sessions[0].id}.`,
    );
  };

  const korevChatCommands: Record<string, Command> = {
    ...chatCommands,
    help: async () => done(KOREV_CHAT_GUIDE),
    'chats send': sendCommand(true),
  };

  const userCommands: Record<string, Command> = {
    ...chatCommands,
    help: async () => done(USER_GUIDE),
    'chats send': sendCommand(false),
    new: newWorkspace,
  };

  return {
    runCli(call: CliCall): Promise<CliReply> {
      if (call.sessionId === USER_CLI_SESSION)
        return runCommand(userCommands, call);
      if (!isKorevChat(call.sessionId)) return deps.workspaceCli(call);
      return runCommand(korevChatCommands, call);
    },
  };
}
