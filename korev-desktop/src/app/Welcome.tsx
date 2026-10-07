import { Button, cn, Icon, Logo } from '../design-system';
import { AGENT_LABELS, type AppState } from '../shared/model';
import { DRAG_REGION } from './layout';
import { AddRepositoryMenu, openProject } from './Sidebar';

export function Welcome({ state }: { state: AppState }) {
  return (
    <div className="flex h-screen flex-col bg-app">
      <div className={cn('h-11 flex-none', DRAG_REGION)} />
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-20 text-center">
        <Logo size={36} />
        <div className="flex max-w-md flex-col gap-2">
          <h1 className="m-0 type-h1 text-fg-1">Run a team of coding agents</h1>
          <p className="m-0 type-body text-fg-2">
            Each task gets its own workspace: a git worktree on a new branch,
            with its own chats, terminal and diff. Add a repository to start.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="lg"
            icon="folder-open"
            onClick={() => openProject()}
          >
            Open project
          </Button>
          <AddRepositoryMenu
            trigger={(toggle) => (
              <Button
                variant="secondary"
                size="lg"
                icon="git-fork"
                onClick={toggle}
              >
                Clone repository
              </Button>
            )}
          />
        </div>
        <div className="flex gap-4 text-xs text-fg-3">
          {state.agents.map((agent) => (
            <span key={agent.agent} className="flex items-center gap-1.5">
              <Icon
                name={agent.version ? 'circle-check' : 'circle-x'}
                size={13}
                className={agent.version ? 'text-success-text' : 'text-fg-4'}
              />
              {AGENT_LABELS[agent.agent]}{' '}
              {agent.version ? `v${agent.version}` : 'not found'}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
