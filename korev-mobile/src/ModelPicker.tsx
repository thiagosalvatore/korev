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
import { PickerButton } from './PickerSheet';

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
  const choices = modelChoices(state, agent);
  const currentKey = loadoutKey(agent, model);

  function pick(key: string) {
    const choice = choices.find(
      (entry) => loadoutKey(entry.agent, entry.id) === key,
    );
    if (choice) onChange(choice);
  }

  return (
    <PickerButton
      label="Model"
      value={modelLabel(state, { agent, model })}
      title="Choose a model"
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
    />
  );
}
