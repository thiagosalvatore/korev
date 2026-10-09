import { Check, ChevronDown } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
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
import { CHROME_FONT_SCALE } from './ui';

const MAX_SHEET_HEIGHT = '70%';

export interface PickerOption {
  key: string;
  label: string;
  detail?: string;
  icon?: ReactNode;
  selected: boolean;
}

export function Sheet({
  title,
  visible,
  onClose,
  children,
}: {
  title: string;
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const styles = makeStyles(useTheme());
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
        {children}
      </View>
    </Modal>
  );
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
  return (
    <Sheet title={title} visible={visible} onClose={onClose}>
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
    </Sheet>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: theme.bgOverlay },
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
    pickerButton: {
      flexDirection: 'row',
      alignItems: 'center',
      flexShrink: 1,
      gap: 4,
    },
    pickerValue: { flexShrink: 1, color: theme.fg3, fontSize: 13 },
  });
}

export function SheetRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const styles = makeStyles(useTheme());
  return (
    <View style={styles.row}>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      {children}
    </View>
  );
}

export function PickerButton({
  label,
  value,
  title,
  options,
  onSelect,
}: {
  label: string;
  value: string;
  title: string;
  options: PickerOption[];
  onSelect: (key: string) => void;
}) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const [open, setOpen] = useState(false);

  function pick(key: string) {
    setOpen(false);
    const current = options.find((option) => option.selected);
    if (key !== current?.key) onSelect(key);
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={8}
        style={styles.pickerButton}
        onPress={() => setOpen(true)}
      >
        <Text
          maxFontSizeMultiplier={CHROME_FONT_SCALE}
          style={styles.pickerValue}
          numberOfLines={1}
        >
          {value}
        </Text>
        <ChevronDown size={ROW_ICON_SIZE} color={theme.fg4} />
      </Pressable>
      <PickerSheet
        title={title}
        visible={open}
        options={options}
        onSelect={pick}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
