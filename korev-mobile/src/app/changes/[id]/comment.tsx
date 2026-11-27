import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { addComment } from '../../../diffComments';
import { MONO_FONT, TYPE, useTheme, type Theme } from '../../../theme';
import { Button } from '../../../ui';

export default function CommentScreen() {
  const { id, path, line, code } = useLocalSearchParams<{
    id: string;
    path: string;
    line: string;
    code: string;
  }>();
  const theme = useTheme();
  const styles = makeStyles(theme);
  const [body, setBody] = useState('');
  const trimmed = body.trim();

  const save = () => {
    addComment(id, { file: path, line: Number(line), code, body: trimmed });
    router.back();
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <Stack.Screen options={{ title: `Comment on line ${line}` }} />
      <Text style={styles.code} numberOfLines={3}>
        {code.trim()}
      </Text>
      <TextInput
        autoFocus
        multiline
        accessibilityLabel="Comment"
        value={body}
        placeholder="Leave a comment for the agent"
        placeholderTextColor={theme.fg4}
        style={styles.field}
        onChangeText={setBody}
      />
      <Button large label="Add comment" disabled={!trimmed} onPress={save} />
    </ScrollView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    page: { padding: 16, gap: 12 },
    code: {
      ...TYPE.caption,
      fontFamily: MONO_FONT,
      color: theme.fg2,
    },
    field: {
      ...TYPE.body,
      minHeight: 120,
      padding: 14,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border2,
      backgroundColor: theme.bgSurface,
      color: theme.fg1,
      textAlignVertical: 'top',
    },
  });
}
