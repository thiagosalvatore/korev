import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type {
  AppState,
  AskChat,
} from '../../../korev-desktop/src/shared/model';
import { insertDictation } from '../../../korev-desktop/src/shared/dictation';
import { repoSections } from '../../../korev-desktop/src/shared/workspaces';
import { attempt } from '../attempt';
import { MicButton, RecordingBar } from '../VoiceInput';
import { useDictation } from '../dictation';
import { useModelChoice, usePendingAction } from '../hooks';
import { useConnection } from '../korev';
import { ModelPicker } from '../ModelPicker';
import { RepoPicker } from '../RepoPicker';
import { useTheme, type Theme } from '../theme';
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
  const theme = useTheme();
  const styles = makeStyles(theme);
  const repos = repoSections(state).flatMap((section) => section.repos);
  const firstRepoId = initialRepoId ?? repos[0]?.id;
  const [repoIds, setRepoIds] = useState(firstRepoId ? [firstRepoId] : []);
  const [question, setQuestion] = useState('');
  const asking = usePendingAction();
  const { agent, model, effort, choose } = useModelChoice(state.settings);
  const dictation = useDictation((spoken) =>
    setQuestion(
      (current) => insertDictation(current, current.length, spoken).text,
    ),
  );
  const dictating = dictation.phase !== 'idle';
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
    <ScrollView
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.label}>Repositories</Text>
      <RepoPicker
        repos={repos}
        selected={repoIds}
        multiple
        onToggle={(repoId) => setRepoIds(toggled(repoIds, repoId))}
      />
      {dictating ? (
        <RecordingBar dictation={dictation} style={styles.input} />
      ) : (
        <TextInput
          style={styles.input}
          value={question}
          onChangeText={setQuestion}
          placeholder="Ask a question about the code. The agent reads it and changes nothing."
          placeholderTextColor={theme.fg4}
          multiline
          autoFocus
        />
      )}
      <View style={styles.toolbar}>
        <View style={styles.model}>
          <ModelPicker
            state={state}
            agent={agent}
            model={model}
            onChange={choose}
          />
        </View>
        <MicButton status={state.dictation} dictation={dictation} />
        <Button
          label="Ask"
          pending={asking.pending !== null}
          disabled={!text || !repoIds.length || dictating}
          onPress={() => void asking.run('ask', ask)}
        />
      </View>
    </ScrollView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    page: { padding: 16, gap: 12 },
    label: { color: theme.fg3, fontSize: 13, fontWeight: '600' },
    input: {
      minHeight: 140,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border2,
      backgroundColor: theme.bgSurface,
      color: theme.fg1,
      fontSize: 15,
      textAlignVertical: 'top',
    },
    toolbar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    model: { flex: 1 },
  });
}
