import { useState, type ReactNode } from 'react';
import { Icon } from '../../design-system';
import {
  AGENT_LABELS,
  type AppState,
  type ChatSession,
  type Workspace,
} from '../../shared/model';
import { api } from '../bridge';
import { useTranscript } from '../hooks';
import { reportFailure } from '../ui/toast';
import {
  EMPTY_WORKSPACE_UI,
  updateWorkspaceUi,
  useUi,
  type DiffComment,
} from '../ui-store';
import { Composer, saveDraft } from './Composer';
import { Transcript } from './Transcript';

export interface ChatViewProps {
  state: AppState;
  workspace: Workspace | null;
  session: ChatSession;
  empty?: ReactNode;
  placeholder?: string;
}

const NO_COMMENTS: DiffComment[] = [];

function EmptyChat({
  session,
  workspace,
}: {
  session: ChatSession;
  workspace: Workspace;
}) {
  return (
    <div className="flex max-w-md flex-col items-center gap-2 text-center">
      <Icon
        name={session.agent === 'claude' ? 'sparkle' : 'hexagon'}
        size={22}
        className="text-fg-3"
      />
      <p className="m-0 text-lg font-semibold text-fg-1">
        {AGENT_LABELS[session.agent]} in {workspace.name}
      </p>
      <p className="m-0 text-sm text-fg-3">
        Working on <span className="font-mono">{workspace.branch}</span>.
        Describe a task to get started.
      </p>
    </div>
  );
}

export function ChatView({
  state,
  workspace,
  session,
  empty,
  placeholder,
}: ChatViewProps) {
  const items = useTranscript(session.id);
  const running = state.runningSessions.includes(session.id);
  const comments = useUi((ui) =>
    workspace
      ? (ui.workspaces[workspace.id] ?? EMPTY_WORKSPACE_UI).comments
      : NO_COMMENTS,
  );
  const [planMode, setPlanMode] = useState(state.settings.defaultPlanMode);
  const [draftVersion, setDraftVersion] = useState(0);
  const agent = state.agents.find((entry) => entry.agent === session.agent);
  const archived = Boolean(workspace?.archivedAt);

  async function revert(itemId: string) {
    const result = await api.revert(session.id, itemId);
    if (!reportFailure(result)) return;
    saveDraft(session.id, result.value);
    setDraftVersion((version) => version + 1);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {items ? (
        <Transcript
          items={items}
          running={running}
          empty={
            empty ??
            (workspace ? (
              <EmptyChat session={session} workspace={workspace} />
            ) : null)
          }
          onRevert={(itemId) => void revert(itemId)}
        />
      ) : (
        <div className="flex-1" />
      )}
      <div className="mx-auto w-full max-w-[820px] px-6 pb-4">
        {archived ? (
          <p className="m-0 rounded-md bg-active px-3 py-2 text-sm text-fg-2">
            This workspace is archived. Unarchive it from History to keep
            working.
          </p>
        ) : (
          <Composer
            key={`${session.id}:${draftVersion}`}
            draftKey={session.id}
            agent={session.agent}
            models={agent?.models ?? []}
            model={session.model}
            effort={session.effort}
            planMode={planMode}
            running={running}
            workspaceId={workspace?.id ?? null}
            comments={comments}
            placeholder={placeholder}
            autoFocus
            onModelChange={(model) =>
              void api.updateSession(session.id, { model })
            }
            onEffortChange={(effort) =>
              void api.updateSession(session.id, { effort })
            }
            onPlanModeChange={setPlanMode}
            onClearComments={() => {
              if (workspace)
                updateWorkspaceUi(workspace.id, () => ({ comments: [] }));
            }}
            onStop={() => void api.stop(session.id)}
            onSend={async (text) =>
              reportFailure(
                await api.send(session.id, {
                  text,
                  model: session.model,
                  effort: session.effort,
                  planMode,
                }),
              )
            }
          />
        )}
        {agent && !agent.version ? (
          <p className="mt-2 mb-0 text-xs text-danger-text">
            {AGENT_LABELS[session.agent]} CLI was not found on your PATH.
            Install it to chat.
          </p>
        ) : null}
      </div>
    </div>
  );
}
