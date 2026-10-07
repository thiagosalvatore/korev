import { useState, type ReactNode } from 'react';
import { Icon, Spinner } from '../../design-system';
import {
  AGENT_LABELS,
  finishedCodexPlan,
  STOP_BEFORE_SWITCHING,
  type AppState,
  type ChatItem,
  type ChatSession,
  type ContextUsage,
  type ModelChoice,
  type Workspace,
} from '../../shared/model';
import { openDiff, openFile } from '../actions';
import { api } from '../bridge';
import { loadoutChoices, modelChoices } from '../../shared/format';
import { useTranscript } from '../hooks';
import { reportFailure, toast } from '../ui/toast';
import {
  EMPTY_WORKSPACE_UI,
  updateWorkspaceUi,
  useUi,
  type DiffComment,
} from '../ui-store';
import { Composer, saveDraft } from './Composer';
import { PlanReview } from './PermissionCard';
import { Transcript } from './Transcript';

function toWorkspaceRelative(workspacePath: string, file: string): string {
  const prefix = `${workspacePath}/`;
  return file.startsWith(prefix) ? file.slice(prefix.length) : file;
}

export interface ChatViewProps {
  state: AppState;
  workspace: Workspace | null;
  session: ChatSession;
  empty?: ReactNode;
  placeholder?: string;
  repoId?: string | null;
}

const NO_COMMENTS: DiffComment[] = [];
const SWITCH_REPLAYS_CHAT =
  'Switching agents mid-chat replays the conversation, so the next reply is slower and uses more tokens';

function latestContext(items: ChatItem[] | null): ContextUsage | null {
  const result = items?.findLast(
    (item) => item.kind === 'result' && item.context,
  );
  return result?.kind === 'result' ? (result.context ?? null) : null;
}

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
  repoId,
}: ChatViewProps) {
  const items = useTranscript(session.id);
  const running = state.runningSessions.includes(session.id);
  const comments = useUi((ui) =>
    workspace
      ? (ui.workspaces[workspace.id] ?? EMPTY_WORKSPACE_UI).comments
      : NO_COMMENTS,
  );
  const [draftVersion, setDraftVersion] = useState(0);
  const agent = state.agents.find((entry) => entry.agent === session.agent);
  const archived = Boolean(workspace?.archivedAt);

  function changeModel(choice: ModelChoice) {
    if (choice.agent === session.agent)
      return void api.updateSession(session.id, { model: choice.id });
    if (running) return toast(STOP_BEFORE_SWITCHING);
    if (items?.length) toast(SWITCH_REPLAYS_CHAT);
    void api.updateSession(session.id, {
      agent: choice.agent,
      model: choice.id,
    });
  }

  function send(text: string, planMode = session.planMode) {
    return api
      .send(session.id, {
        text,
        agent: session.agent,
        model: session.model,
        effort: session.effort,
        planMode,
        fast: session.fast,
      })
      .then(reportFailure);
  }

  const codexPlan = workspace
    ? finishedCodexPlan(session, items, running)
    : null;

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
          onOpenTurnFile={(file, range) => {
            if (workspace) openDiff(workspace.id, file, range);
          }}
          onOpenFile={
            workspace
              ? (file, line) =>
                  openFile(
                    workspace.id,
                    toWorkspaceRelative(workspace.path, file),
                    { line },
                  )
              : undefined
          }
          onRespond={(itemId, response) =>
            void api
              .respondPermission(session.id, itemId, response)
              .then(reportFailure)
          }
          onRetry={(text) => void send(text)}
          footer={
            codexPlan ? (
              <PlanReview
                key={codexPlan.id}
                plan={codexPlan.plan}
                showPlan={false}
                onApprove={(lanes) =>
                  void api.approvePlan(session.id, lanes).then(reportFailure)
                }
                onKeepPlanning={(feedback) => void send(feedback, true)}
              />
            ) : null
          }
        />
      ) : (
        <Spinner />
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
            models={modelChoices(state, session.agent)}
            loadout={loadoutChoices(state, session.agent)}
            snippets={state.settings.snippets}
            fast={session.fast}
            repoId={workspace?.repoId ?? repoId ?? null}
            onFastChange={(fast) =>
              void api.updateSession(session.id, { fast })
            }
            model={session.model}
            effort={session.effort}
            planMode={session.planMode}
            running={running}
            workspaceId={workspace?.id ?? null}
            comments={comments}
            otherTabs={
              workspace?.sessions.filter((entry) => entry.id !== session.id) ??
              []
            }
            placeholder={placeholder}
            autoFocus
            usage={{
              context: latestContext(items),
              limits: state.planLimits[session.agent] ?? [],
            }}
            onModelChange={changeModel}
            onEffortChange={(effort) =>
              void api.updateSession(session.id, { effort })
            }
            onPlanModeChange={(planMode) =>
              void api.updateSession(session.id, { planMode })
            }
            onClearComments={() => {
              if (workspace)
                updateWorkspaceUi(workspace.id, () => ({ comments: [] }));
            }}
            onStop={() => void api.stop(session.id)}
            onSend={send}
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
