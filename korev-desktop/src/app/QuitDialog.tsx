import { Button, Dialog, Icon, Toast } from '../design-system';
import type { QuitChoice } from '../shared/api';
import type { AppState } from '../shared/model';
import { api } from './bridge';
import { setUi, useUi } from './ui-store';

interface RunningAgent {
  sessionId: string;
  name: string;
  detail: string;
}

function runningAgents(state: AppState): RunningAgent[] {
  const repoName = (repoId: string) =>
    state.repos.find((repo) => repo.id === repoId)?.name ?? '';
  const inWorkspaces = state.workspaces.flatMap((workspace) =>
    workspace.sessions.map((session) => ({
      sessionId: session.id,
      name: workspace.name,
      detail: `${repoName(workspace.repoId)} · ${session.title}`,
    })),
  );
  const inAsks = state.askChats.map((ask) => ({
    sessionId: ask.session.id,
    name: ask.session.title,
    detail: 'Ask',
  }));
  return [...inWorkspaces, ...inAsks].filter((agent) =>
    state.runningSessions.includes(agent.sessionId),
  );
}

function agentCount(count: number) {
  return `${count} agent${count === 1 ? '' : 's'}`;
}

function choose(choice: QuitChoice) {
  setUi({ quit: choice === 'wait' ? 'waiting' : 'closed' });
  void api.chooseQuit(choice);
}

const cancelQuit = () => choose('cancel');

function AgentRow({ agent }: { agent: RunningAgent }) {
  return (
    <li className="flex items-center gap-3 rounded-md border border-border-1 px-3 py-2.5">
      <Icon
        name="loader-circle"
        size={14}
        className="animate-spin text-accent-text"
      />
      <div className="min-w-0 flex-1">
        <div className="truncate type-ui font-medium text-fg-1">
          {agent.name}
        </div>
        <div className="truncate text-xs text-fg-3">{agent.detail}</div>
      </div>
    </li>
  );
}

export function QuitDialog({ state }: { state: AppState }) {
  const open = useUi((ui) => ui.quit === 'asking');
  if (!open) return null;
  const agents = runningAgents(state);
  return (
    <Dialog
      open
      onClose={cancelQuit}
      title={
        agents.length
          ? `${agentCount(agents.length)} still working`
          : 'All agents finished'
      }
      description="Quitting now stops them. Their chats keep everything up to now."
      footer={
        <>
          <Button variant="ghost" onClick={cancelQuit}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => choose('quit')}>
            Quit now
          </Button>
          <Button variant="primary" autoFocus onClick={() => choose('wait')}>
            Quit when done
          </Button>
        </>
      }
    >
      <ul className="m-0 flex max-h-64 list-none flex-col gap-1.5 overflow-y-auto p-0">
        {agents.map((agent) => (
          <AgentRow key={agent.sessionId} agent={agent} />
        ))}
      </ul>
    </Dialog>
  );
}

export function QuitPending({ state }: { state: AppState }) {
  const waiting = useUi((ui) => ui.quit === 'waiting');
  if (!waiting) return null;
  return (
    <Toast
      tone="warning"
      icon="hourglass"
      title="Korev quits when the agents finish"
      description={`${agentCount(state.runningSessions.length)} still working`}
      action={
        <>
          <Button size="sm" variant="secondary" onClick={() => choose('quit')}>
            Quit now
          </Button>
          <Button size="sm" variant="ghost" onClick={cancelQuit}>
            Don't quit
          </Button>
        </>
      }
    />
  );
}
