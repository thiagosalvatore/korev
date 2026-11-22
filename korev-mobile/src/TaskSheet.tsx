import { ListTodo } from 'lucide-react-native';
import type { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Dictation } from './dictation';
import { TYPE, useTheme, type Theme } from './theme';
import { CHROME_FONT_SCALE, touchSlop } from './ui';
import { RecordingBar } from './VoiceInput';

const CHIP_HEIGHT = 32;
const CHIP_ICON_SIZE = 15;

export function TaskChip({ children }: { children: ReactNode }) {
  const styles = makeStyles(useTheme());
  return <View style={styles.chip}>{children}</View>;
}

export function PlanToggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const color = on ? theme.accentText : theme.fg2;
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel="Plan mode"
      accessibilityState={{ checked: on }}
      hitSlop={touchSlop(CHIP_HEIGHT)}
      style={[styles.chip, on && styles.chipOn]}
      onPress={() => onChange(!on)}
    >
      <ListTodo size={CHIP_ICON_SIZE} color={color} />
      <Text
        maxFontSizeMultiplier={CHROME_FONT_SCALE}
        style={[styles.chipText, { color }]}
      >
        Plan
      </Text>
    </Pressable>
  );
}

export function TaskSheet({
  picker,
  text,
  placeholder,
  planMode = false,
  dictation,
  onChangeText,
  options,
  mic,
  action,
}: {
  picker: ReactNode;
  text: string;
  placeholder: string;
  planMode?: boolean;
  dictation: Dictation;
  onChangeText: (text: string) => void;
  options: ReactNode;
  mic: ReactNode;
  action: ReactNode;
}) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const fieldStyle = [styles.field, planMode && styles.fieldPlanMode];
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      {picker}
      {dictation.phase === 'idle' ? (
        <TextInput
          style={fieldStyle}
          value={text}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.fg4}
          multiline
        />
      ) : (
        <RecordingBar dictation={dictation} style={fieldStyle} />
      )}
      <View style={styles.options}>
        {options}
        <View style={styles.grow} />
        {mic}
      </View>
      {action}
    </ScrollView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    page: { padding: 16, gap: 12 },
    field: {
      ...TYPE.body,
      minHeight: 150,
      padding: 14,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border2,
      backgroundColor: theme.bgSurface,
      color: theme.fg1,
      textAlignVertical: 'top',
    },
    fieldPlanMode: { borderColor: theme.accent, borderStyle: 'dashed' },
    options: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    grow: { flex: 1 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      height: CHIP_HEIGHT,
      paddingHorizontal: 12,
      borderRadius: CHIP_HEIGHT / 2,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border2,
      backgroundColor: theme.bgSurface,
    },
    chipOn: { borderColor: theme.accent, backgroundColor: theme.accentSubtle },
    chipText: { ...TYPE.footnote, fontWeight: '600' },
  });
}
