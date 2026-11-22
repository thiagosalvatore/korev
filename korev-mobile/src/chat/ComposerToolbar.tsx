import { router } from 'expo-router';
import { ChevronDown, Zap } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import {
  formatTokens,
  modelChoices,
  modelLabel,
} from '../../../korev-desktop/src/shared/format';
import {
  effortLevels,
  type AppState,
  type ChatSession,
  type ContextUsage,
  type PlanLimit,
} from '../../../korev-desktop/src/shared/model';
import { TYPE, useTheme, type Theme } from '../theme';
import { CHROME_FONT_SCALE, touchSlop } from '../ui';
import { useSessionUpdate } from './sessionUpdate';

const CHIP_HEIGHT = 28;
const CHIP_ICON_SIZE = 13;
const RING_SIZE = 20;
const RING_STROKE = 2.5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const PERCENT = 100;
const WARNING_PERCENT = 80;
const DANGER_PERCENT = 95;

function contextPercent(context: ContextUsage): number {
  return Math.min(
    PERCENT,
    (context.usedTokens / context.windowTokens) * PERCENT,
  );
}

function ringColor(theme: Theme, percent: number): string {
  if (percent >= DANGER_PERCENT) return theme.danger;
  if (percent >= WARNING_PERCENT) return theme.warning;
  return theme.fg3;
}

function contextSummary(
  context: ContextUsage | null,
  limits: PlanLimit[],
): string {
  const window = context
    ? `${Math.round(contextPercent(context))}% used · ${formatTokens(context.usedTokens)} of ${formatTokens(context.windowTokens)} tokens`
    : 'Appears after the first reply';
  const plan = limits.map(
    (limit) => `${limit.label}: ${Math.round(limit.usedPercent)}% used`,
  );
  return [window, ...plan].join('\n');
}

function ContextRing({
  context,
  limits,
}: {
  context: ContextUsage | null;
  limits: PlanLimit[];
}) {
  const theme = useTheme();
  const percent = context ? contextPercent(context) : 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        context
          ? `Context window ${Math.round(percent)}% full`
          : 'Context window'
      }
      hitSlop={touchSlop(RING_SIZE)}
      onPress={() =>
        Alert.alert('Context window', contextSummary(context, limits))
      }
    >
      <Svg
        width={RING_SIZE}
        height={RING_SIZE}
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
      >
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={theme.border2}
          strokeWidth={RING_STROKE}
          fill="none"
        />
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={ringColor(theme, percent)}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={[
            (percent / PERCENT) * RING_CIRCUMFERENCE,
            RING_CIRCUMFERENCE,
          ]}
          fill="none"
          rotation={-90}
          origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
        />
      </Svg>
    </Pressable>
  );
}

function ToolChip({
  label,
  accessibilityLabel,
  icon,
  active = false,
  onPress,
}: {
  label: string;
  accessibilityLabel?: string;
  icon?: ReactNode;
  active?: boolean;
  onPress: () => void;
}) {
  const styles = makeStyles(useTheme());
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: active }}
      hitSlop={touchSlop(CHIP_HEIGHT)}
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipActive,
        pressed && styles.chipPressed,
      ]}
      onPress={onPress}
    >
      <Text
        maxFontSizeMultiplier={CHROME_FONT_SCALE}
        style={[styles.chipText, active && styles.chipTextActive]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {icon}
    </Pressable>
  );
}

export function ComposerToolbar({
  state,
  session,
  context,
}: {
  state: AppState;
  session: ChatSession;
  context: ContextUsage | null;
}) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const update = useSessionUpdate(session.id);
  const efforts = effortLevels(
    session.agent,
    modelChoices(state, session.agent),
    session.model,
  );
  const nextEffort =
    efforts[(efforts.indexOf(session.effort) + 1) % efforts.length];
  const openOptions = () =>
    router.push({
      pathname: '/session/[id]/options',
      params: { id: session.id },
    });

  return (
    <View style={styles.toolbar}>
      <ToolChip
        label={modelLabel(state, session)}
        accessibilityLabel="Chat options"
        icon={<ChevronDown size={CHIP_ICON_SIZE} color={theme.fg3} />}
        onPress={openOptions}
      />
      <ToolChip
        label="Plan"
        accessibilityLabel="Plan mode"
        active={session.planMode}
        onPress={() => update({ planMode: !session.planMode })}
      />
      {efforts.length > 1 ? (
        <ToolChip
          label={session.effort}
          accessibilityLabel={`Effort ${session.effort}. Change to ${nextEffort}`}
          onPress={() => update({ effort: nextEffort })}
        />
      ) : null}
      {session.fast ? (
        <ToolChip
          label="Fast"
          accessibilityLabel="Fast mode. Turn it off"
          icon={<Zap size={CHIP_ICON_SIZE} color={theme.accentText} />}
          active
          onPress={() => update({ fast: false })}
        />
      ) : null}
      <View style={styles.spacer} />
      <ContextRing
        context={context}
        limits={state.planLimits[session.agent] ?? []}
      />
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 2,
    },
    spacer: { flex: 1 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      flexShrink: 1,
      gap: 3,
      minHeight: CHIP_HEIGHT,
      paddingHorizontal: 10,
      borderRadius: CHIP_HEIGHT / 2,
      backgroundColor: theme.bgActive,
    },
    chipActive: { backgroundColor: theme.accentSubtle },
    chipPressed: { opacity: 0.7 },
    chipText: { ...TYPE.footnote, flexShrink: 1, color: theme.fg2 },
    chipTextActive: { color: theme.accentText, fontWeight: '600' },
  });
}
