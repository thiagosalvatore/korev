import { Check } from 'lucide-react-native';
import type { ReactNode } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ROW_ICON_SIZE } from './ListRow';
import { useTheme, type Theme } from './theme';

const MAX_SHEET_HEIGHT = '70%';

export interface PickerOption {
  key: string;
  label: string;
  detail?: string;
  icon?: ReactNode;
  selected: boolean;
}

export function PickerSheet({
  title,
  visible,
  options,
  onSelect,
  onClose,
}: {
  title: string;
  visible: boolean;
  options: PickerOption[];
  onSelect: (key: string) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        accessibilityLabel="Close"
        style={styles.backdrop}
        onPress={onClose}
      />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 8 }]}>
        <Text style={styles.title}>{title}</Text>
        <ScrollView>
          {options.map((option) => (
            <Pressable
              key={option.key}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: option.selected }}
              accessibilityLabel={option.label}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              onPress={() => onSelect(option.key)}
            >
              {option.icon}
              <Text style={styles.label} numberOfLines={1}>
                {option.label}
              </Text>
              {option.detail ? (
                <Text style={styles.detail}>{option.detail}</Text>
              ) : null}
              <View style={styles.check}>
                {option.selected ? (
                  <Check size={ROW_ICON_SIZE} color={theme.accentText} />
                ) : null}
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)' },
    sheet: {
      maxHeight: MAX_SHEET_HEIGHT,
      paddingTop: 12,
      paddingHorizontal: 8,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      backgroundColor: theme.bgRaised,
    },
    title: {
      paddingHorizontal: 10,
      paddingBottom: 8,
      color: theme.fg3,
      fontSize: 13,
      fontWeight: '600',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 48,
      paddingHorizontal: 10,
      borderRadius: 8,
    },
    pressed: { backgroundColor: theme.bgHover },
    label: { flex: 1, color: theme.fg1, fontSize: 15 },
    detail: { color: theme.fg4, fontSize: 13 },
    check: { width: ROW_ICON_SIZE },
  });
}
