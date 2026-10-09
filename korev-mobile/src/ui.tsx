import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { useTheme, type Theme } from './theme';

export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger';

function variantColors(theme: Theme, variant: ButtonVariant) {
  if (variant === 'secondary')
    return { background: theme.bgActive, text: theme.fg1 };
  const background = {
    primary: theme.accent,
    success: theme.success,
    danger: theme.danger,
  }[variant];
  return { background, text: theme.fgOnAccent };
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  pending = false,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  pending?: boolean;
}) {
  const colors = variantColors(useTheme(), variant);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || pending, busy: pending }}
      disabled={disabled || pending}
      onPress={onPress}
      style={[
        styles.button,
        { backgroundColor: colors.background },
        disabled && !pending && styles.disabled,
      ]}
    >
      <Text
        style={[styles.label, { color: colors.text }, pending && styles.hidden]}
      >
        {label}
      </Text>
      {pending ? (
        <ActivityIndicator
          size="small"
          color={colors.text}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
    </Pressable>
  );
}

export const ICON_BUTTON_SIZE = 36;
export const ICON_BUTTON_ICON_SIZE = 20;

export function IconButton({
  label,
  icon,
  background,
  onPress,
  disabled = false,
}: {
  label: string;
  icon: ReactNode;
  background: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={[
        styles.iconButton,
        { backgroundColor: background },
        disabled && styles.disabled,
      ]}
    >
      {icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    width: ICON_BUTTON_SIZE,
    height: ICON_BUTTON_SIZE,
    borderRadius: ICON_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  disabled: { opacity: 0.4 },
  hidden: { opacity: 0 },
  label: { fontSize: 15, fontWeight: '600' },
});
