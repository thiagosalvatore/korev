import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  answerQuestions,
  DISMISS_QUESTION,
  QUESTION_REPLY_HINT,
  togglePick,
  type AgentQuestion,
  type PermissionResponse,
  type QuestionPicks,
} from '../../../korev-desktop/src/shared/model';
import { usePendingAction } from '../hooks';
import { useTheme, type Theme } from '../theme';
import { Button } from '../ui';
import { MarkdownView } from './MarkdownView';

const PANEL_MAX_HEIGHT = 360;

function QuestionField({
  question,
  picked,
  onPick,
  styles,
}: {
  question: AgentQuestion;
  picked: string[];
  onPick(labels: string[]): void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.question}>
      <MarkdownView value={question.question} />
      {question.options.map((option) => (
        <Pressable
          key={option.label}
          accessibilityRole="button"
          accessibilityState={{ selected: picked.includes(option.label) }}
          style={[
            styles.option,
            picked.includes(option.label) && styles.optionSelected,
          ]}
          onPress={() => onPick(togglePick(question, picked, option.label))}
        >
          <Text style={styles.optionLabel}>{option.label}</Text>
          {option.description ? (
            <Text style={styles.optionDescription}>{option.description}</Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

export function QuestionPanel({
  questions,
  picks,
  onPick,
  onRespond,
}: {
  questions: AgentQuestion[];
  picks: QuestionPicks;
  onPick(question: string, labels: string[]): void;
  onRespond(response: PermissionResponse): Promise<boolean>;
}) {
  const styles = makeStyles(useTheme());
  const response = answerQuestions(questions, picks);
  const { pending, run } = usePendingAction({ holdOnSuccess: true });
  return (
    <View style={styles.panel}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>The agent has a question</Text>
        {questions.map((question) => (
          <QuestionField
            key={question.question}
            question={question}
            picked={picks[question.question] ?? []}
            onPick={(labels) => onPick(question.question, labels)}
            styles={styles}
          />
        ))}
      </ScrollView>
      <View style={styles.actions}>
        <Button
          label="Answer"
          pending={pending === 'answer'}
          disabled={pending !== null || !response}
          onPress={() =>
            response && void run('answer', () => onRespond(response))
          }
        />
        <Button
          label="Dismiss"
          variant="secondary"
          pending={pending === 'dismiss'}
          disabled={pending !== null}
          onPress={() => void run('dismiss', () => onRespond(DISMISS_QUESTION))}
        />
      </View>
      <Text style={styles.hint}>{QUESTION_REPLY_HINT}</Text>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    panel: {
      marginHorizontal: 8,
      marginBottom: 6,
      padding: 12,
      gap: 10,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.warning,
      backgroundColor: theme.bgRaised,
    },
    scroll: { maxHeight: PANEL_MAX_HEIGHT },
    content: { gap: 10 },
    title: { color: theme.fg1, fontSize: 15, fontWeight: '600' },
    question: { gap: 6 },
    option: {
      padding: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border2,
    },
    optionSelected: {
      borderColor: theme.accent,
      backgroundColor: theme.accentSubtle,
    },
    optionLabel: { color: theme.fg1, fontSize: 14, fontWeight: '600' },
    optionDescription: { color: theme.fg3, fontSize: 13 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    hint: { color: theme.fg3, fontSize: 13 },
  });
}
