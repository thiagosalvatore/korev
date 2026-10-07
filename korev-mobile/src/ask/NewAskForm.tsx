import { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type {
  AppState,
  AskChat,
} from '../../../korev-desktop/src/shared/model';
import { repoSections } from '../../../korev-desktop/src/shared/workspaces';
import { attempt } from '../attempt';
import { useConnection } from '../korev';
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
  const [asking, setAsking] = useState(false);
  const text = question.trim();

  async function ask() {
    setAsking(true);
    await attempt('Korev could not ask the question', async () => {
      const created = await api.createAskChat(repoIds);
      const { agent, model, effort } = created.session;
      const sent = await api.send(created.session.id, {
        text,
        agent,
        model,
        effort,
        planMode: false,
        fast: false,
      });
      onAsked(created);
      return sent;
    });
    setAsking(false);
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
      <TextInput
        style={styles.input}
        value={question}
        onChangeText={setQuestion}
        placeholder="Ask a question about the code. The agent reads it and changes nothing."
        placeholderTextColor={theme.fg4}
        multiline
        autoFocus
      />
      <View style={styles.toolbar}>
        {asking ? <ActivityIndicator /> : null}
        <Button
          label="Ask"
          disabled={asking || !text || !repoIds.length}
          onPress={() => void ask()}
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
    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 10,
    },
  });
}
