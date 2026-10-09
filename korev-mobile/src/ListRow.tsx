import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
} from 'react-native';
import { useTheme, type Theme } from './theme';

export const ROW_ICON_SIZE = 16;

export function ListRow({
  icon,
  title,
  subtitle,
  end,
  highlighted = false,
  accessibilityLabel,
  accessibilityActions,
  onAccessibilityAction,
  onPress,
}: Pick<PressableProps, 'accessibilityActions' | 'onAccessibilityAction'> & {
  icon: ReactNode;
  title: string;
  subtitle: ReactNode;
  end?: ReactNode;
  highlighted?: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const styles = makeStyles(useTheme());
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={onPress}
    >
      <View style={styles.icon}>{icon}</View>
      <View style={styles.text}>
        <Text
          style={[styles.title, highlighted && styles.titleHighlighted]}
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {end ? <View style={styles.end}>{end}</View> : null}
    </Pressable>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      minHeight: 48,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 8,
    },
    pressed: { backgroundColor: theme.bgHover },
    icon: { width: 20, alignItems: 'center', paddingTop: 1 },
    text: { flex: 1, gap: 2 },
    title: { color: theme.fg2, fontSize: 15, fontWeight: '500' },
    titleHighlighted: { color: theme.fg1, fontWeight: '700' },
    subtitle: { color: theme.fg3, fontSize: 13 },
    end: { alignItems: 'flex-end', gap: 6, paddingTop: 2 },
  });
}
