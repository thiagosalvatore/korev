import { useState } from 'react';
import type {
  AppState,
  AskChat,
} from '../../../korev-desktop/src/shared/model';
import { insertDictation } from '../../../korev-desktop/src/shared/dictation';
import { pickerRepos } from '../../../korev-desktop/src/shared/workspaces';
import { attempt } from '../attempt';
import { MicButton } from '../VoiceInput';
import { useDictation } from '../dictation';
import { useModelChoice, usePendingAction } from '../hooks';
import { useConnection } from '../korev';
import { ModelPicker } from '../ModelPicker';
import { RepoPicker } from '../RepoPicker';
import { TaskChip, TaskSheet } from '../TaskSheet';
import { Button } from '../ui';

function toggled(list: string[], id: string): string[] {
  return list.includes(id)
    ? list.filter((entry) => entry !== id)
    : [...list, id];
}

export function NewAskForm({
  state,
  initialRepoId,
  onAsked,
}: {
  state: AppState;
  initialRepoId?: string;
  onAsked: (ask: AskChat) => void;
}) {
  const { api } = useConnection();
  const [repoIds, setRepoIds] = useState(initialRepoId ? [initialRepoId] : []);
  const [question, setQuestion] = useState('');
  const asking = usePendingAction();
  const { agent, model, effort, choose } = useModelChoice(state.settings);
  const dictation = useDictation((spoken) =>
    setQuestion(
      (current) => insertDictation(current, current.length, spoken).text,
    ),
  );
  const text = question.trim();

  async function ask() {
    let created: AskChat | undefined;
    await attempt('Korev could not ask the question', async () => {
      created = await api.createAskChat(repoIds);
      return api.send(created.session.id, {
        text,
        agent,
        model: model || created.session.model,
        effort,
        planMode: false,
        fast: false,
      });
    });
    if (created) onAsked(created);
  }

  return (
    <TaskSheet
      picker={
        <RepoPicker
          repos={pickerRepos(state)}
          selected={repoIds}
          multiple
          onToggle={(repoId) => setRepoIds(toggled(repoIds, repoId))}
        />
      }
      text={question}
      placeholder="Ask a question about the code. The agent reads it and changes nothing."
      dictation={dictation}
      onChangeText={setQuestion}
      options={
        <TaskChip>
          <ModelPicker
            state={state}
            agent={agent}
            model={model}
            onChange={choose}
          />
        </TaskChip>
      }
      mic={<MicButton status={state.dictation} dictation={dictation} />}
      action={
        <Button
          large
          label="Ask"
          pending={asking.pending !== null}
          disabled={!text || !repoIds.length || dictation.phase !== 'idle'}
          onPress={() => void asking.run('ask', ask)}
        />
      }
    />
  );
}
