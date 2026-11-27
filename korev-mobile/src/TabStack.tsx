import { Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { withOfflineStrip } from './Offline';
import { TYPE, useTheme } from './theme';
import { CHROME_FONT_SCALE, MIN_TOUCH_TARGET, touchSlop } from './ui';

export const HEADER_ICON_SIZE = 22;

export function TabStack({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <Stack
      screenLayout={withOfflineStrip}
      screenOptions={{
        headerLargeTitleEnabled: true,
        headerLargeTitleShadowVisible: false,
        headerShadowVisible: false,
        headerTintColor: theme.fg1,
        headerTitleStyle: { color: theme.fg1 },
        headerLargeTitleStyle: { color: theme.fg1 },
        contentStyle: { backgroundColor: theme.bgApp },
      }}
    >
      {children}
    </Stack>
  );
}

export function HeaderButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={touchSlop(HEADER_ICON_SIZE)}
      style={styles.button}
      onPress={onPress}
    >
      {children}
    </Pressable>
  );
}

export function HeaderTextButton({
  label,
  onPress,
  bold = false,
}: {
  label: string;
  onPress: () => void;
  bold?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      style={styles.textButton}
      onPress={onPress}
    >
      <Text
        maxFontSizeMultiplier={CHROME_FONT_SCALE}
        style={[TYPE.body, bold && styles.bold, { color: theme.fg1 }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { paddingHorizontal: 6 },
  textButton: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  bold: { fontWeight: '600' },
});
