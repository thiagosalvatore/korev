import { ArrowUp, X } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { messageParts } from '../../../korev-desktop/src/shared/message';
import type { ChatItem } from '../../../korev-desktop/src/shared/model';
import { TYPE, useTheme, type Theme } from '../theme';
import { touchSlop } from '../ui';

const BUTTON_SIZE = 28;
const ICON_SIZE = 16;

type UserItem = Extract<ChatItem, { kind: 'user' }>;

export function QueuedMessages({
  items,
  onSendNow,
  onRemove,
}: {
  items: UserItem[];
  onSendNow(itemId: string): void;
  onRemove(itemId: string): void;
}) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  if (!items.length) return null;
  return (
    <View style={styles.tray}>
      <Text style={styles.title}>Queued until the agent finishes</Text>
      {items.map((item) => (
        <View key={item.id} style={styles.row}>
          <Text style={styles.text} numberOfLines={1}>
            {messageParts(item.text).body}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send now"
            hitSlop={touchSlop(BUTTON_SIZE)}
            style={[styles.button, styles.send]}
            onPress={() => onSendNow(item.id)}
          >
            <ArrowUp size={ICON_SIZE} color={theme.fgOnAccent} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove from the queue"
            hitSlop={touchSlop(BUTTON_SIZE)}
            style={styles.button}
            onPress={() => onRemove(item.id)}
          >
            <X size={ICON_SIZE} color={theme.fg2} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    tray: {
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border1,
      backgroundColor: theme.bgSurface,
    },
    title: { ...TYPE.caption, color: theme.fg3 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    text: { ...TYPE.subhead, flex: 1, color: theme.fg1 },
    button: {
      alignItems: 'center',
      justifyContent: 'center',
      width: BUTTON_SIZE,
      height: BUTTON_SIZE,
      borderRadius: BUTTON_SIZE / 2,
      backgroundColor: theme.bgActive,
    },
    send: { backgroundColor: theme.accent },
  });
}
