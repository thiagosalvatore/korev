import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  answerQuestions,
  DISMISS_QUESTION,
  laneDrafts,
  laneHere,
  lanesToSplit,
  planLanes,
  splitLabel,
  type AgentQuestion,
  type ChatItem,
  type LaneDraft,
  type PermissionResponse,
  type PermissionStatus,
  type PlanLane,
  type Repo,
} from '../../../korev-desktop/src/shared/model';
import { usePendingAction } from '../hooks';
import { RepoPicker } from '../RepoPicker';
import { MONO_FONT, useTheme, type Theme } from '../theme';
import { Button, switchTrack } from '../ui';
import { MarkdownView } from './MarkdownView';

type PermissionItem = Extract<ChatItem, { kind: 'permission' }>;

interface PermissionCardProps {
  item: PermissionItem;
  laneRepos?: Repo[];
  onRespond(response: PermissionResponse): Promise<boolean>;
  onHandoff?(): Promise<boolean>;
}

const STATUS_LABELS: Record<Exclude<PermissionStatus, 'pending'>, string> = {
  allowed: 'Approved',
  denied: 'Denied',
  expired: 'No longer waiting',
  'handed-off': 'Handed off to a new tab',
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
  const { pending, run } = usePendingAction({ holdOnSuccess: true });
  const respond = (key: string, response: PermissionResponse) =>
    void run(key, () => onRespond(response));
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Allow {item.tool}?</Text>
      {item.detail ? (
        <Text selectable style={styles.detail}>
          {item.detail}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button
          label="Allow"
          pending={pending === 'allow'}
          disabled={pending !== null}
          onPress={() => respond('allow', { allow: true })}
        />
        <Button
          label="Deny"
          variant="secondary"
          pending={pending === 'deny'}
          disabled={pending !== null}
          onPress={() => respond('deny', { allow: false })}
        />
      </View>
    </View>
  );
}

function LaneList({
  here,
  drafts,
  repos,
  onChange,
}: {
  here: PlanLane | undefined;
  drafts: LaneDraft[];
  repos: Repo[];
  onChange(drafts: LaneDraft[]): void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const update = (index: number, change: Partial<LaneDraft>) =>
    onChange(
      drafts.map((draft, at) =>
        at === index ? { ...draft, ...change } : draft,
      ),
    );
  return (
    <View style={styles.question}>
      <Text style={styles.body}>
        Lanes: each ticked lane gets its own linked workspace
      </Text>
      {here ? (
        <View style={styles.lane}>
          <Switch
            value
            disabled
            accessibilityLabel={here.name}
            trackColor={switchTrack(theme)}
          />
          <Text style={styles.optionLabel}>{here.name}</Text>
          <Text style={styles.optionDescription}>
            {repos.length
              ? `This workspace · ${repos[0].name}`
              : 'This workspace'}
          </Text>
        </View>
      ) : null}
      {drafts.map((draft, index) => (
        <View key={index} style={styles.laneDraft}>
          <View style={styles.lane}>
            <Switch
              value={draft.split}
              accessibilityLabel={`Split off ${draft.name}`}
              trackColor={switchTrack(theme)}
              onValueChange={(split) => update(index, { split })}
            />
            <TextInput
              style={[styles.input, styles.laneName]}
              value={draft.name}
              editable={draft.split}
              accessibilityLabel="Lane name"
              onChangeText={(name) => update(index, { name })}
            />
          </View>
          {draft.repoId && draft.split ? (
            <RepoPicker
              repos={repos}
              selected={[draft.repoId]}
              label={`Repository for ${draft.name}`}
              onToggle={(repoId) => update(index, { repoId })}
            />
          ) : null}
        </View>
      ))}
    </View>
  );
}

export interface PlanReviewProps {
  plan: string;
  showPlan: boolean;
  laneRepos?: Repo[];
  onApprove(lanes: PlanLane[]): Promise<boolean>;
  onKeepPlanning(feedback: string): Promise<boolean>;
  onHandoff?(): Promise<boolean>;
}

export function PlanReview({
  plan,
  showPlan,
  laneRepos = [],
  onApprove,
  onKeepPlanning,
  onHandoff,
}: PlanReviewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const [feedback, setFeedback] = useState('');
  const lanes = planLanes(plan, laneRepos.length ? 1 : 2);
  const { here, others } = laneHere(lanes, laneRepos);
  const [drafts, setDrafts] = useState(() => laneDrafts(others, laneRepos));
  const split = lanesToSplit(drafts);
  const { pending, run } = usePendingAction({ holdOnSuccess: true });
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Plan ready for review</Text>
      {showPlan ? <MarkdownView value={plan} /> : null}
      {lanes.length ? (
        <LaneList
          here={here}
          drafts={drafts}
          repos={laneRepos}
          onChange={setDrafts}
        />
      ) : null}
      <TextInput
        style={styles.input}
        value={feedback}
        onChangeText={setFeedback}
        placeholder="Optional: tell the agent what to change in the plan"
        placeholderTextColor={theme.fg4}
        multiline
      />
      <View style={styles.actions}>
        {split.length ? (
          <Button
            label={splitLabel(split.length)}
            pending={pending === 'split'}
            disabled={pending !== null}
            onPress={() => void run('split', () => onApprove(split))}
          />
        ) : null}
        <Button
          label={lanes.length ? 'Approve here' : 'Approve plan'}
          variant={split.length ? 'secondary' : 'primary'}
          pending={pending === 'approve'}
          disabled={pending !== null}
          onPress={() => void run('approve', () => onApprove([]))}
        />
        {onHandoff ? (
          <Button
            label="Hand off"
            variant="secondary"
            pending={pending === 'handoff'}
            disabled={pending !== null}
            onPress={() => void run('handoff', onHandoff)}
          />
        ) : null}
        <Button
          label="Keep planning"
          variant="secondary"
          pending={pending === 'keep-planning'}
          disabled={pending !== null || !feedback.trim()}
          onPress={() =>
            void run('keep-planning', () => onKeepPlanning(feedback))
          }
        />
      </View>
    </View>
  );
}

function PlanApproval({
  item,
  laneRepos,
  onRespond,
  onHandoff,
}: PermissionCardProps) {
  return (
    <PlanReview
      plan={item.plan ?? ''}
      showPlan
      laneRepos={laneRepos}
      onHandoff={onHandoff}
      onApprove={(lanes) => onRespond({ allow: true, lanes })}
      onKeepPlanning={(message) => onRespond({ allow: false, message })}
    />
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
    const chosen = other ? [] : value;
    setOther('');
    if (!question.multiSelect) return onChange([label]);
    return onChange(
      chosen.includes(label)
        ? chosen.filter((entry) => entry !== label)
        : [...chosen, label],
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
  const { pending, run } = usePendingAction({ holdOnSuccess: true });
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
    </View>
  );
}

export function PermissionCard({
  item,
  laneRepos,
  onRespond,
  onHandoff,
}: PermissionCardProps) {
  if (item.status !== 'pending') return <Resolved item={item} />;
  if (item.plan !== null)
    return (
      <PlanApproval
        item={item}
        laneRepos={laneRepos}
        onRespond={onRespond}
        onHandoff={onHandoff}
      />
    );
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
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    lane: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    laneDraft: { gap: 6 },
    laneName: { flex: 1 },
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
