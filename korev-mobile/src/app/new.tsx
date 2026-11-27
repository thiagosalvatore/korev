import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  AGENT_LABELS,
  type AppState,
  type SendOptions,
  type Workspace,
} from '../../../korev-desktop/src/shared/model';
import { insertDictation } from '../../../korev-desktop/src/shared/dictation';
import {
  pickerRepos,
  repoSections,
} from '../../../korev-desktop/src/shared/workspaces';
import { attempt } from '../attempt';
import { succeeded } from '../haptics';
import { MicButton } from '../VoiceInput';
import { useDictation } from '../dictation';
import { useAppState, useModelChoice, usePendingAction } from '../hooks';
import { Loading } from '../Offline';
import { useConnection } from '../korev';
import { ModelPicker } from '../ModelPicker';
import { RepoPicker } from '../RepoPicker';
import { PlanToggle, TaskChip, TaskSheet } from '../TaskSheet';
import { Button } from '../ui';

function openWorkspace(workspace: Workspace) {
  router.replace({ pathname: '/workspace/[id]', params: { id: workspace.id } });
}

function NewWorkspaceForm({
  state,
  initialRepoId,
}: {
  state: AppState;
  initialRepoId: string | undefined;
}) {
  const { api } = useConnection();
  const repos = repoSections(state).flatMap((section) => section.repos);
  const [repoId, setRepoId] = useState(initialRepoId ?? repos[0]?.id);
  const [prompt, setPrompt] = useState('');
  const [planMode, setPlanMode] = useState(state.settings.defaultPlanMode);
  const creating = usePendingAction();
  const { agent, model, effort, choose } = useModelChoice(state.settings);
  const dictation = useDictation((spoken) =>
    setPrompt(
      (current) => insertDictation(current, current.length, spoken).text,
    ),
  );
  const task: SendOptions = {
    text: prompt.trim(),
    agent,
    model,
    effort,
    planMode,
    fast: false,
  };

  async function create() {
    if (!repoId) return;
    await attempt('Korev could not create the workspace', async () => {
      const created = await api.createWorkspaces(
        [repoId],
        task.text ? task : null,
      );
      if (created.ok && created.value[0]) openWorkspace(created.value[0]);
      return created;
    }).then(succeeded);
  }

  return (
    <TaskSheet
      picker={
        <RepoPicker
          label="Repository"
          repos={pickerRepos(state)}
          selected={repoId ? [repoId] : []}
          onToggle={setRepoId}
        />
      }
      text={prompt}
      placeholder={`Describe a task for ${AGENT_LABELS[task.agent]}`}
      planMode={planMode}
      dictation={dictation}
      onChangeText={setPrompt}
      options={
        <>
          <TaskChip>
            <ModelPicker
              state={state}
              agent={agent}
              model={model}
              onChange={choose}
            />
          </TaskChip>
          <PlanToggle on={planMode} onChange={setPlanMode} />
        </>
      }
      mic={<MicButton status={state.dictation} dictation={dictation} />}
      action={
        <Button
          large
          label={task.text ? 'Start' : 'Create'}
          pending={creating.pending !== null}
          disabled={!repoId || dictation.phase !== 'idle'}
          onPress={() => void creating.run('create', create)}
        />
      }
    />
  );
}

export default function NewWorkspaceScreen() {
  const { repoId } = useLocalSearchParams<{ repoId?: string }>();
  const state = useAppState();
  if (!state) return <Loading />;
  return <NewWorkspaceForm state={state} initialRepoId={repoId} />;
}
