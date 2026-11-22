import { Stack } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';
import { duration } from '../../../korev-desktop/src/shared/format';
import { LoadingRing } from '../LoadingRing';
import { TYPE, useTheme, type Theme } from '../theme';
import { CHROME_FONT_SCALE, touchSlop } from '../ui';
import type { ChatStatus, ChatStatusKind } from './chatStatus';

const TICK_MS = 1000;
const DOT_SIZE = 7;
const CAPSULE_HEIGHT = 28;

export interface ChatMenuAction {
  label: string;
  icon?: SFSymbol;
  subtitle?: string;
  isOn?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  onPress(): void;
}

export interface ChatMenuGroup {
  label: string;
  icon?: SFSymbol;
  inline?: boolean;
  items: ChatMenuEntry[];
}

export type ChatMenuEntry = ChatMenuAction | ChatMenuGroup;

function isGroup(entry: ChatMenuEntry): entry is ChatMenuGroup {
  return 'items' in entry;
}

function menuElement(entry: ChatMenuEntry, key: string) {
  if (!isGroup(entry))
    return (
      <Stack.Toolbar.MenuAction
        key={key}
        icon={entry.icon}
        subtitle={entry.subtitle}
        isOn={entry.isOn}
        destructive={entry.destructive}
        disabled={entry.disabled}
        onPress={entry.onPress}
      >
        {entry.label}
      </Stack.Toolbar.MenuAction>
    );
  return (
    <Stack.Toolbar.Menu
      key={key}
      title={entry.label}
      icon={entry.icon}
      inline={entry.inline}
    >
      {entry.items.map((item, index) => menuElement(item, `${key}.${index}`))}
    </Stack.Toolbar.Menu>
  );
}

export function ChatMenu({
  entries,
  badge,
}: {
  entries: ChatMenuEntry[];
  badge?: string;
}) {
  return (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Menu
        icon="ellipsis.circle"
        accessibilityLabel="Chat actions"
      >
        {badge ? <Stack.Toolbar.Badge>{badge}</Stack.Toolbar.Badge> : null}
        {entries.map((entry, index) => menuElement(entry, String(index)))}
      </Stack.Toolbar.Menu>
    </Stack.Toolbar>
  );
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return <>{` · ${duration(Math.max(0, now - since))}`}</>;
}

function statusColor(theme: Theme, kind: ChatStatusKind): string {
  return {
    working: theme.accentText,
    waiting: theme.warningText,
    ready: theme.successText,
    done: theme.merged,
    alert: theme.dangerText,
    idle: theme.fg4,
  }[kind];
}

export function ChatTitle({
  title,
  subtitle,
  status,
  since,
}: {
  title: string;
  subtitle?: string;
  status: ChatStatus | null;
  since?: number;
}) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const shownStatus = status?.kind === 'idle' && subtitle ? null : status;
  const color = shownStatus && statusColor(theme, shownStatus.kind);
  return (
    <View style={styles.title} accessibilityRole="header">
      <Text
        maxFontSizeMultiplier={CHROME_FONT_SCALE}
        style={styles.titleText}
        numberOfLines={1}
      >
        {title}
      </Text>
      {shownStatus && color ? (
        <View style={styles.status}>
          {shownStatus.kind === 'working' ? (
            <LoadingRing size={11} color={color} />
          ) : shownStatus.kind === 'idle' ? null : (
            <View style={[styles.dot, { backgroundColor: color }]} />
          )}
          <Text
            maxFontSizeMultiplier={CHROME_FONT_SCALE}
            style={styles.statusText}
            numberOfLines={1}
          >
            {shownStatus.label}
            {shownStatus.kind === 'working' && since !== undefined ? (
              <Elapsed since={since} />
            ) : null}
          </Text>
        </View>
      ) : subtitle ? (
        <Text
          maxFontSizeMultiplier={CHROME_FONT_SCALE}
          style={styles.statusText}
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

export function Capsule({
  label,
  icon,
  tone,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  icon?: ReactNode;
  tone?: string;
  accessibilityLabel?: string;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={accessibilityLabel}
      disabled={!onPress}
      hitSlop={touchSlop(CAPSULE_HEIGHT)}
      style={({ pressed }) => [styles.capsule, pressed && styles.pressed]}
      onPress={onPress}
    >
      {icon}
      <Text
        maxFontSizeMultiplier={CHROME_FONT_SCALE}
        style={[styles.capsuleText, tone ? { color: tone } : null]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function ChatAccessory({
  children,
  footer,
}: {
  children: ReactNode;
  footer?: ReactNode;
}) {
  const styles = makeStyles(useTheme());
  return (
    <View style={styles.accessory}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.capsules}
      >
        {children}
      </ScrollView>
      {footer}
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    title: { alignItems: 'center', maxWidth: 240 },
    titleText: { ...TYPE.headline, color: theme.fg1 },
    status: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    statusText: { ...TYPE.caption, color: theme.fg3 },
    dot: { width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2 },
    accessory: {
      gap: 4,
      paddingVertical: 6,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border1,
    },
    capsules: { alignItems: 'center', gap: 8, paddingHorizontal: 16 },
    capsule: {
      flexDirection: 'row',
      alignItems: 'center',
      flexShrink: 1,
      gap: 5,
      minHeight: CAPSULE_HEIGHT,
      paddingHorizontal: 10,
      borderRadius: CAPSULE_HEIGHT / 2,
      backgroundColor: theme.bgRaised,
    },
    pressed: { backgroundColor: theme.bgActive },
    capsuleText: { ...TYPE.footnote, color: theme.fg2, flexShrink: 1 },
  });
}
