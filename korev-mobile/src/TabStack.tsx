import { Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useTheme } from './theme';
import { touchSlop } from './ui';

export const HEADER_ICON_SIZE = 22;

export function TabStack({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <Stack
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

const styles = StyleSheet.create({
  button: { paddingHorizontal: 6 },
});
