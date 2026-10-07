import { useState } from 'react';
import { Button, cn, Icon, IconButton } from '../design-system';
import type { AppState, AskChat } from '../shared/model';
import { deleteAsk, startAsk, startFromAsk } from './actions';
import { ChatView } from './chat/ChatView';
import { Composer } from './chat/Composer';
import { loadoutChoices, modelChoices } from './format';
import { useModelChoice } from './hooks';
import { DRAG_REGION, NO_DRAG, TRAFFIC_LIGHT_GUTTER } from './layout';
import { RepoPicker } from './RepoPicker';
import { useUi } from './ui-store';

const NEW_ASK_DRAFT = 'new-ask';

function NewAsk({
  state,
  initialRepoIds,
}: {
  state: AppState;
  initialRepoIds: string[];
}) {
  const sidebar = useUi((ui) => ui.sidebar);
  const [repoIds, setRepoIds] = useState(
    initialRepoIds.length
      ? initialRepoIds
      : state.repos.slice(0, 1).map((repo) => repo.id),
  );
  const { agent, model, effort, setEffort, choose } = useModelChoice(
    state.settings,
  );
  const [fast, setFast] = useState(false);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div
        className={cn(
          'h-11 flex-none',
          DRAG_REGION,
          !sidebar && TRAFFIC_LIGHT_GUTTER,
        )}
      />
      <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 pt-[12vh]">
        <div className="flex w-full max-w-[720px] flex-col gap-4">
          <h1 className="m-0 type-h2 text-fg-1">Ask</h1>
          <p className="m-0 text-sm text-fg-3">
            Ask about one or more repositories without creating a workspace. The
            agent reads the latest default branch and cannot change anything.
          </p>
          <RepoPicker state={state} selected={repoIds} onChange={setRepoIds} />
          <Composer
            draftKey={NEW_ASK_DRAFT}
            agent={agent}
            models={modelChoices(state, agent)}
            loadout={loadoutChoices(state, agent)}
            snippets={state.settings.snippets}
            fast={fast}
            repoId={repoIds[0] ?? null}
            onFastChange={setFast}
            model={model}
            effort={effort}
            planMode={false}
            running={false}
            workspaceId={null}
            autoFocus
            placeholder={
              repoIds.length
                ? 'Ask a question. Enter sends it.'
                : 'Pick at least one repository first.'
            }
            onModelChange={choose}
            onEffortChange={setEffort}
            onPlanModeChange={() => undefined}
            onSend={async (text) =>
              repoIds.length > 0 &&
              startAsk(repoIds, {
                text,
                agent,
                model,
                effort,
                planMode: false,
                fast,
              })
            }
          />
        </div>
      </div>
    </div>
  );
}

function AskChatView({ state, ask }: { state: AppState; ask: AskChat }) {
  const sidebar = useUi((ui) => ui.sidebar);
  const running = state.runningSessions.includes(ask.session.id);
  const [starting, setStarting] = useState(false);
  const repoNames = ask.repoIds
    .map((repoId) => state.repos.find((repo) => repo.id === repoId)?.name)
    .join(', ');
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-app">
      <header
        className={cn(
          'flex h-11 flex-none items-center gap-2 border-b border-border-1 bg-app pr-2',
          DRAG_REGION,
          sidebar ? 'pl-3' : TRAFFIC_LIGHT_GUTTER,
        )}
      >
        <Icon name="message-circle-question" size={14} className="text-fg-3" />
        <span className="truncate text-sm font-semibold text-fg-1">
          {ask.session.title}
        </span>
        <span className="truncate text-xs text-fg-3">
          {repoNames} · read-only
        </span>
        <span className="flex-1" />
        <Button
          size="sm"
          variant="primary"
          icon="git-branch-plus"
          className={NO_DRAG}
          disabled={running}
          loading={starting}
          title={`Continue this conversation in a new workspace in ${ask.repoIds.length > 1 ? 'each repository' : 'this repository'}`}
          onClick={async () => {
            setStarting(true);
            await startFromAsk(ask);
            setStarting(false);
          }}
        >
          {ask.repoIds.length > 1 ? 'Start workspaces' : 'Start workspace'}
        </Button>
        <IconButton
          icon="trash-2"
          label="Delete chat"
          size="sm"
          className={NO_DRAG}
          onClick={() => deleteAsk(ask)}
        />
      </header>
      <ChatView
        key={ask.session.id}
        state={state}
        workspace={null}
        repoId={ask.repoIds[0] ?? null}
        session={ask.session}
        placeholder="Ask a follow-up"
      />
    </div>
  );
}

export function AskPage({
  state,
  askChatId,
  repoIds,
}: {
  state: AppState;
  askChatId: string | null;
  repoIds: string[];
}) {
  const ask = state.askChats.find((entry) => entry.id === askChatId);
  if (ask) return <AskChatView state={state} ask={ask} />;
  return <NewAsk state={state} initialRepoIds={repoIds} />;
}
