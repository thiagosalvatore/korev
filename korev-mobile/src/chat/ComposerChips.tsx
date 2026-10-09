import { ListChecks, Paperclip, X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { fileName } from '../../../korev-desktop/src/shared/format';
import { planFileName } from '../../../korev-desktop/src/shared/message';
import type { ChatSession } from '../../../korev-desktop/src/shared/model';
import { useTheme, type Theme } from '../theme';
import { CHROME_FONT_SCALE, ICON_BUTTON_SIZE, touchSlop } from '../ui';
import { PlanChip } from './PlanChip';

const CHIP_ICON_SIZE = 14;
export const COMPOSER_ROW_GAP = 8;

function RemoveButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={touchSlop(CHIP_ICON_SIZE)}
      onPress={onPress}
    >
      <X size={CHIP_ICON_SIZE} color={theme.accentText} />
    </Pressable>
  );
}

function confirmDiscardPlan(onDiscard: () => void) {
  Alert.alert(
    'Remove the handed-off plan?',
    'Your next message will go without it.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: onDiscard },
    ],
  );
}

export function ComposerChips({
  pendingPlan,
  planMode,
  attachments,
  uploading,
  onDiscardPlan,
  onTurnOffPlanMode,
  onRemoveAttachment,
}: {
  pendingPlan: ChatSession['pendingPlan'];
  planMode: boolean;
  attachments: string[];
  uploading: number;
  onDiscardPlan(): void;
  onTurnOffPlanMode(): void;
  onRemoveAttachment(file: string): void;
}) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const chips: ReactNode[] = [];
  if (pendingPlan)
    chips.push(
      <View key="pending-plan" style={styles.chip}>
        <PlanChip
          name={planFileName(pendingPlan.plan)}
          markdown={pendingPlan.plan}
          style={styles.chipBody}
        >
          <ListChecks size={CHIP_ICON_SIZE} color={theme.accentText} />
          <Text
            maxFontSizeMultiplier={CHROME_FONT_SCALE}
            style={styles.label}
            numberOfLines={1}
          >
            Plan · {pendingPlan.from}
          </Text>
        </PlanChip>
        <RemoveButton
          label="Remove the handed-off plan"
          onPress={() => confirmDiscardPlan(onDiscardPlan)}
        />
      </View>,
    );
  if (planMode)
    chips.push(
      <View key="plan-mode" style={styles.chip}>
        <Text maxFontSizeMultiplier={CHROME_FONT_SCALE} style={styles.label}>
          Plan mode
        </Text>
        <RemoveButton label="Turn off plan mode" onPress={onTurnOffPlanMode} />
      </View>,
    );
  for (const file of attachments)
    chips.push(
      <View key={file} style={styles.chip}>
        <Paperclip size={CHIP_ICON_SIZE} color={theme.accentText} />
        <Text
          maxFontSizeMultiplier={CHROME_FONT_SCALE}
          style={styles.label}
          numberOfLines={1}
        >
          {fileName(file)}
        </Text>
        <RemoveButton
          label={`Remove ${fileName(file)}`}
          onPress={() => onRemoveAttachment(file)}
        />
      </View>,
    );
  if (uploading)
    chips.push(
      <View key="uploading" style={styles.chip}>
        <ActivityIndicator size="small" color={theme.accentText} />
        <Text maxFontSizeMultiplier={CHROME_FONT_SCALE} style={styles.label}>
          Attaching…
        </Text>
      </View>,
    );
  if (!chips.length) return null;
  return <View style={styles.chips}>{chips}</View>;
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginLeft: ICON_BUTTON_SIZE + COMPOSER_ROW_GAP,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      maxWidth: '100%',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      backgroundColor: theme.accentSubtle,
    },
    chipBody: {
      flexDirection: 'row',
      alignItems: 'center',
      flexShrink: 1,
      gap: 6,
    },
    label: { flexShrink: 1, color: theme.accentText, fontSize: 13 },
  });
}
