import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import {
  pendingDecisions,
  type DecisionGate,
  type OrchestrationRun,
  type RunQuestion,
} from '../../../korev-desktop/src/shared/model';
import { attempt } from '../attempt';
import { usePendingAction } from '../hooks';
import { useConnection } from '../korev';
import { useTheme, type Theme } from '../theme';
import { Button } from '../ui';
import { MarkdownView } from './MarkdownView';

const DECISION_FAILED = 'Could not send the decision';
const ANSWER_FAILED = 'Could not send the answer';

function useStyles() {
  return makeStyles(useTheme());
}

function GateCard({
  run,
  gate,
}: {
  run: OrchestrationRun;
  gate: DecisionGate;
}) {
  const styles = useStyles();
  const { api } = useConnection();
  const { pending, run: start } = usePendingAction({ holdOnSuccess: true });
  return (
    <View style={styles.card}>
      <Text style={styles.label}>Decision for {gate.taskId}</Text>
      <Text style={styles.body}>{gate.question}</Text>
      <View style={styles.actions}>
        {gate.options.map((option) => (
          <Button
            key={option}
            label={option}
            variant="secondary"
            pending={pending === option}
            disabled={pending !== null}
            onPress={() =>
              void start(option, () =>
                attempt(DECISION_FAILED, () =>
                  api.resolveGate(run.id, gate.id, option),
                ),
              )
            }
          />
        ))}
      </View>
    </View>
  );
}

function QuestionCard({
  run,
  question,
}: {
  run: OrchestrationRun;
  question: RunQuestion;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const { api } = useConnection();
  const [answer, setAnswer] = useState('');
  const { pending, run: start } = usePendingAction({ holdOnSuccess: true });
  const send = (key: string, text: string) =>
    void start(key, () =>
      attempt(ANSWER_FAILED, () =>
        api.answerQuestion(run.id, question.id, text),
      ),
    );
  return (
    <View style={styles.card}>
      <Text style={styles.label}>The worker of {question.taskId} asks</Text>
      <MarkdownView value={question.question} />
      <View style={styles.actions}>
        {question.options.map((option) => (
          <Button
            key={option}
            label={option}
            variant="secondary"
            pending={pending === option}
            disabled={pending !== null}
            onPress={() => send(option, option)}
          />
        ))}
      </View>
      <TextInput
        accessibilityLabel={`Answer ${question.id}`}
        placeholder="Answer instead of the coordinator"
        placeholderTextColor={theme.fg3}
        value={answer}
        onChangeText={setAnswer}
        style={styles.input}
      />
      <Button
        label="Answer"
        pending={pending === 'typed'}
        disabled={pending !== null || !answer.trim()}
        onPress={() => send('typed', answer.trim())}
      />
    </View>
  );
}

export function RunDecisions({ run }: { run: OrchestrationRun }) {
  const styles = useStyles();
  const { gates, questions } = pendingDecisions(run);
  if (!gates.length && !questions.length) return null;
  return (
    <View style={styles.list}>
      {gates.map((gate) => (
        <GateCard key={gate.id} run={run} gate={gate} />
      ))}
      {questions.map((question) => (
        <QuestionCard key={question.id} run={run} question={question} />
      ))}
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    list: { gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
    card: {
      gap: 10,
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.warning,
      backgroundColor: theme.bgRaised,
    },
    label: { color: theme.fg3, fontSize: 13 },
    body: { color: theme.fg1, fontSize: 15, lineHeight: 21 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    input: {
      minHeight: 40,
      padding: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border2,
      color: theme.fg1,
    },
  });
}
