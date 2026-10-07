import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  answerQuestions,
  DISMISS_QUESTION,
  type AgentQuestion,
  type ChatItem,
  type PermissionResponse,
  type PermissionStatus,
} from '../../../korev-desktop/src/shared/model';
import { MONO_FONT, useTheme, type Theme } from '../theme';
import { Button } from '../ui';

type PermissionItem = Extract<ChatItem, { kind: 'permission' }>;

interface PermissionCardProps {
  item: PermissionItem;
  onRespond(response: PermissionResponse): void;
}

const STATUS_LABELS: Record<Exclude<PermissionStatus, 'pending'>, string> = {
  allowed: 'Approved',
  denied: 'Denied',
  expired: 'No longer waiting',
};

function useStyles() {
  return makeStyles(useTheme());
}

function subject(item: PermissionItem): string {
  if (item.plan !== null) return 'Plan';
  return item.questions ? 'Question' : item.tool;
}

function Resolved({ item }: { item: PermissionItem }) {
  const styles = useStyles();
  const label = item.status === 'pending' ? '' : STATUS_LABELS[item.status];
  return (
    <Text style={styles.resolved}>
      {label} · {subject(item)}
    </Text>
  );
}

function ToolApproval({ item, onRespond }: PermissionCardProps) {
  const styles = useStyles();
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Allow {item.tool}?</Text>
      {item.detail ? (
        <Text selectable style={styles.detail}>
          {item.detail}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button label="Allow" onPress={() => onRespond({ allow: true })} />
        <Button
          label="Deny"
          variant="secondary"
          onPress={() => onRespond({ allow: false })}
        />
      </View>
    </View>
  );
}

function PlanApproval({ item, onRespond }: PermissionCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const [feedback, setFeedback] = useState('');
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Plan ready for review</Text>
      <Text selectable style={styles.body}>
        {item.plan}
      </Text>
      <TextInput
        style={styles.input}
        value={feedback}
        onChangeText={setFeedback}
        placeholder="Optional: tell the agent what to change in the plan"
        placeholderTextColor={theme.fg4}
        multiline
      />
      <View style={styles.actions}>
        <Button
          label="Approve plan"
          onPress={() => onRespond({ allow: true })}
        />
        <Button
          label="Keep planning"
          variant="secondary"
          disabled={!feedback.trim()}
          onPress={() => onRespond({ allow: false, message: feedback })}
        />
      </View>
    </View>
  );
}

function QuestionField({
  question,
  value,
  onChange,
}: {
  question: AgentQuestion;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const [other, setOther] = useState('');
  const toggle = (label: string) => {
    if (!question.multiSelect) return onChange([label]);
    return onChange(
      value.includes(label)
        ? value.filter((entry) => entry !== label)
        : [...value, label],
    );
  };
  return (
    <View style={styles.question}>
      <Text style={styles.body}>{question.question}</Text>
      {question.options.map((option) => (
        <Pressable
          key={option.label}
          accessibilityRole="button"
          accessibilityState={{ selected: value.includes(option.label) }}
          style={[
            styles.option,
            value.includes(option.label) && styles.optionSelected,
          ]}
          onPress={() => toggle(option.label)}
        >
          <Text style={styles.optionLabel}>{option.label}</Text>
          {option.description ? (
            <Text style={styles.optionDescription}>{option.description}</Text>
          ) : null}
        </Pressable>
      ))}
      <TextInput
        style={styles.input}
        value={other}
        onChangeText={(text) => {
          setOther(text);
          onChange(text ? [text] : []);
        }}
        placeholder="Other…"
        placeholderTextColor={theme.fg4}
      />
    </View>
  );
}

function QuestionForm({ item, onRespond }: PermissionCardProps) {
  const styles = useStyles();
  const questions = item.questions ?? [];
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const response = answerQuestions(questions, answers);
  return (
    <View style={styles.card}>
      <Text style={styles.title}>The agent has a question</Text>
      {questions.map((question) => (
        <QuestionField
          key={question.question}
          question={question}
          value={answers[question.question] ?? []}
          onChange={(value) =>
            setAnswers((current) => ({
              ...current,
              [question.question]: value,
            }))
          }
        />
      ))}
      <View style={styles.actions}>
        <Button
          label="Answer"
          disabled={!response}
          onPress={() => response && onRespond(response)}
        />
        <Button
          label="Dismiss"
          variant="secondary"
          onPress={() => onRespond(DISMISS_QUESTION)}
        />
      </View>
    </View>
  );
}

export function PermissionCard({ item, onRespond }: PermissionCardProps) {
  if (item.status !== 'pending') return <Resolved item={item} />;
  if (item.plan !== null)
    return <PlanApproval item={item} onRespond={onRespond} />;
  if (item.questions) return <QuestionForm item={item} onRespond={onRespond} />;
  return <ToolApproval item={item} onRespond={onRespond} />;
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    resolved: { color: theme.fg4, fontSize: 13 },
    card: {
      gap: 10,
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.warning,
      backgroundColor: theme.bgRaised,
    },
    title: { color: theme.fg1, fontSize: 15, fontWeight: '600' },
    body: { color: theme.fg1, fontSize: 15, lineHeight: 21 },
    detail: { color: theme.fg2, fontFamily: MONO_FONT, fontSize: 12 },
    actions: { flexDirection: 'row', gap: 8 },
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
