import { Pressable, StyleSheet, Text } from 'react-native';
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
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
}) {
  const colors = variantColors(useTheme(), variant);
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        { backgroundColor: colors.background },
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  disabled: { opacity: 0.4 },
  label: { fontSize: 15, fontWeight: '600' },
});
