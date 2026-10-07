import { ChevronDown } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import {
  modelChoices,
  modelLabel,
} from '../../korev-desktop/src/shared/format';
import {
  AGENT_LABELS,
  loadoutKey,
  type AgentKind,
  type AppState,
  type ModelChoice,
} from '../../korev-desktop/src/shared/model';
import { ROW_ICON_SIZE } from './ListRow';
import { PickerSheet } from './PickerSheet';
import { useTheme, type Theme } from './theme';

export function ModelPicker({
  state,
  agent,
  model,
  onChange,
}: {
  state: AppState;
  agent: AgentKind;
  model: string;
  onChange: (choice: ModelChoice) => void;
}) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const [open, setOpen] = useState(false);
  const choices = modelChoices(state, agent);
  const currentKey = loadoutKey(agent, model);

  function pick(key: string) {
    setOpen(false);
    const choice = choices.find(
      (entry) => loadoutKey(entry.agent, entry.id) === key,
    );
    if (choice && key !== currentKey) onChange(choice);
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Model"
        hitSlop={8}
        style={styles.button}
        onPress={() => setOpen(true)}
      >
        <Text style={styles.label} numberOfLines={1}>
          {modelLabel(state, { agent, model })}
        </Text>
        <ChevronDown size={ROW_ICON_SIZE} color={theme.fg4} />
      </Pressable>
      <PickerSheet
        title="Choose a model"
        visible={open}
        options={choices.map((choice) => {
          const key = loadoutKey(choice.agent, choice.id);
          return {
            key,
            label: choice.label,
            detail: AGENT_LABELS[choice.agent],
            selected: key === currentKey,
          };
        })}
        onSelect={pick}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      flexShrink: 1,
      gap: 4,
    },
    label: { flexShrink: 1, color: theme.fg3, fontSize: 13 },
  });
}
