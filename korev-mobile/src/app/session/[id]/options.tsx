import { useLocalSearchParams } from 'expo-router';
import { Check } from 'lucide-react-native';
import type { ReactNode } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { modelChoices } from '../../../../../korev-desktop/src/shared/format';
import {
  AGENT_FEATURES,
  AGENT_LABELS,
  effortLevels,
  loadoutKey,
  STOP_BEFORE_SWITCHING,
  type ModelChoice,
} from '../../../../../korev-desktop/src/shared/model';
import { findSession, useSessionUpdate } from '../../../chat/sessionUpdate';
import { useAppState } from '../../../hooks';
import { TYPE, useTheme, type Theme } from '../../../theme';
import { MIN_TOUCH_TARGET, switchTrack } from '../../../ui';

const CHECK_SIZE = 18;

function Section({ title, children }: { title: string; children: ReactNode }) {
  const styles = makeStyles(useTheme());
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </Text>
      <View style={styles.group}>{children}</View>
    </View>
  );
}

function ChoiceRow({
  label,
  detail,
  selected,
  first,
  onPress,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  first: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.row,
        !first && styles.divided,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
    >
      <View style={styles.rowText}>
        <Text style={styles.label}>{label}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
      {selected ? <Check size={CHECK_SIZE} color={theme.accentText} /> : null}
    </Pressable>
  );
}

function SwitchRow({
  label,
  value,
  first,
  onChange,
}: {
  label: string;
  value: boolean;
  first: boolean;
  onChange: (value: boolean) => void;
}) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  return (
    <View style={[styles.row, !first && styles.divided]}>
      <Text style={[styles.label, styles.rowText]}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        trackColor={switchTrack(theme)}
        onValueChange={onChange}
      />
    </View>
  );
}

export default function ChatOptionsSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useAppState();
  const styles = makeStyles(useTheme());
  const update = useSessionUpdate(id);
  const session = state && findSession(state, id);
  if (!state || !session) return <View style={styles.sheet} />;

  const running = state.runningSessions.includes(session.id);
  const currentModel = loadoutKey(session.agent, session.model);
  const choices = modelChoices(state, session.agent);
  const efforts = effortLevels(session.agent, choices, session.model);

  function chooseModel(choice: ModelChoice) {
    if (choice.agent !== session?.agent && running)
      return Alert.alert(STOP_BEFORE_SWITCHING);
    update({ agent: choice.agent, model: choice.id });
  }

  return (
    <ScrollView
      style={styles.sheet}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Section title="Model">
        {choices.map((choice, index) => (
          <ChoiceRow
            key={loadoutKey(choice.agent, choice.id)}
            label={choice.label}
            detail={AGENT_LABELS[choice.agent]}
            selected={loadoutKey(choice.agent, choice.id) === currentModel}
            first={index === 0}
            onPress={() => chooseModel(choice)}
          />
        ))}
      </Section>
      {efforts.length ? (
        <Section title="Effort">
          {efforts.map((effort, index) => (
            <ChoiceRow
              key={effort}
              label={effort}
              selected={effort === session.effort}
              first={index === 0}
              onPress={() => update({ effort })}
            />
          ))}
        </Section>
      ) : null}
      <Section title="Modes">
        <SwitchRow
          label="Plan mode"
          value={session.planMode}
          first
          onChange={(planMode) => update({ planMode })}
        />
        {AGENT_FEATURES[session.agent].fast ? (
          <SwitchRow
            label="Fast mode"
            value={session.fast}
            first={false}
            onChange={(fast) => update({ fast })}
          />
        ) : null}
      </Section>
    </ScrollView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    sheet: { backgroundColor: theme.bgApp },
    content: { gap: 24, padding: 16 },
    section: { gap: 8 },
    sectionTitle: {
      paddingHorizontal: 16,
      color: theme.fg3,
      ...TYPE.footnote,
      fontWeight: '600',
    },
    group: {
      overflow: 'hidden',
      borderRadius: 12,
      backgroundColor: theme.bgSurface,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: MIN_TOUCH_TARGET,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    divided: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border1,
    },
    pressed: { backgroundColor: theme.bgHover },
    rowText: { flex: 1 },
    label: { ...TYPE.callout, color: theme.fg1 },
    detail: { ...TYPE.footnote, color: theme.fg3 },
  });
}
