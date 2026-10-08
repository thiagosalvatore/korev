import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  AGENT_LABELS,
  type AppState,
  type SendOptions,
  type Workspace,
} from '../../../korev-desktop/src/shared/model';
import { insertDictation } from '../../../korev-desktop/src/shared/dictation';
import { repoSections } from '../../../korev-desktop/src/shared/workspaces';
import { attempt } from '../attempt';
import { MicButton, RecordingBar } from '../VoiceInput';
import { useDictation } from '../dictation';
import { useAppState, useModelChoice } from '../hooks';
import { useConnection } from '../korev';
import { ModelPicker } from '../ModelPicker';
import { RepoPicker } from '../RepoPicker';
import { useTheme, type Theme } from '../theme';
import { Button } from '../ui';

const LOADING_STYLE = { marginTop: 40 };

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
  const theme = useTheme();
  const styles = makeStyles(theme);
  const repos = repoSections(state).flatMap((section) => section.repos);
  const [repoId, setRepoId] = useState(initialRepoId ?? repos[0]?.id);
  const [prompt, setPrompt] = useState('');
  const [planMode, setPlanMode] = useState(state.settings.defaultPlanMode);
  const [creating, setCreating] = useState(false);
  const { agent, model, effort, choose } = useModelChoice(state.settings);
  const dictation = useDictation((spoken) =>
    setPrompt(
      (current) => insertDictation(current, current.length, spoken).text,
    ),
  );
  const dictating = dictation.phase !== 'idle';
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
    setCreating(true);
    await attempt('Korev could not create the workspace', async () => {
      const created = await api.createWorkspaces(
        [repoId],
        task.text ? task : null,
      );
      if (created.ok && created.value[0]) openWorkspace(created.value[0]);
      return created;
    });
    setCreating(false);
  }

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.label}>Repository</Text>
      <RepoPicker
        repos={repos}
        selected={repoId ? [repoId] : []}
        onToggle={setRepoId}
      />
      {dictating ? (
        <RecordingBar
          dictation={dictation}
          style={[styles.input, planMode && styles.inputPlanMode]}
        />
      ) : (
        <TextInput
          style={[styles.input, planMode && styles.inputPlanMode]}
          value={prompt}
          onChangeText={setPrompt}
          placeholder={`Describe a task for ${AGENT_LABELS[task.agent]}`}
          placeholderTextColor={theme.fg4}
          multiline
          autoFocus
        />
      )}
      <View style={styles.toolbar}>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: planMode }}
          hitSlop={8}
          onPress={() => setPlanMode(!planMode)}
        >
          <Text style={planMode ? styles.planOn : styles.meta}>Plan</Text>
        </Pressable>
        <View style={styles.model}>
          <ModelPicker
            state={state}
            agent={agent}
            model={model}
            onChange={choose}
          />
        </View>
        {creating ? <ActivityIndicator /> : null}
        <MicButton status={state.dictation} dictation={dictation} />
        <Button
          label={task.text ? 'Create and start' : 'Create'}
          disabled={creating || !repoId || dictating}
          onPress={() => void create()}
        />
      </View>
    </ScrollView>
  );
}

export default function NewWorkspaceScreen() {
  const { repoId } = useLocalSearchParams<{ repoId?: string }>();
  const state = useAppState();
  if (!state) return <ActivityIndicator style={LOADING_STYLE} />;
  return <NewWorkspaceForm state={state} initialRepoId={repoId} />;
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
    inputPlanMode: { borderColor: theme.accent, borderStyle: 'dashed' },
    toolbar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    meta: { color: theme.fg3, fontSize: 13 },
    planOn: { color: theme.accentText, fontSize: 13, fontWeight: '600' },
    model: { flex: 1 },
  });
}
