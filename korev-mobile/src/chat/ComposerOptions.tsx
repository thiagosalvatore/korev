import { SlidersHorizontal } from 'lucide-react-native';
import { useState } from 'react';
import { Switch } from 'react-native';
import type { KorevApi } from '../../../korev-desktop/src/shared/api';
import {
  EFFORT_LEVELS,
  type AppState,
  type ChatSession,
  type ModelChoice,
} from '../../../korev-desktop/src/shared/model';
import { ModelPicker } from '../ModelPicker';
import { PickerButton, Sheet, SheetRow } from '../PickerSheet';
import { useTheme } from '../theme';
import { ICON_BUTTON_ICON_SIZE, IconButton, switchTrack } from '../ui';

export type SessionPatch = Parameters<KorevApi['updateSession']>[1];

const TITLE = 'Chat options';

export function ComposerOptions({
  state,
  session,
  onUpdate,
  onChangeModel,
}: {
  state: AppState;
  session: ChatSession;
  onUpdate(patch: SessionPatch): void;
  onChangeModel(choice: ModelChoice): void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton
        label={TITLE}
        icon={
          <SlidersHorizontal size={ICON_BUTTON_ICON_SIZE} color={theme.fg2} />
        }
        background={theme.bgActive}
        onPress={() => setOpen(true)}
      />
      <Sheet title={TITLE} visible={open} onClose={() => setOpen(false)}>
        <SheetRow label="Model">
          <ModelPicker
            state={state}
            agent={session.agent}
            model={session.model}
            onChange={onChangeModel}
          />
        </SheetRow>
        <SheetRow label="Effort">
          <PickerButton
            label="Effort"
            value={session.effort}
            title="Choose the effort"
            options={EFFORT_LEVELS[session.agent].map((level) => ({
              key: level,
              label: level,
              selected: level === session.effort,
            }))}
            onSelect={(effort) => onUpdate({ effort })}
          />
        </SheetRow>
        <SheetRow label="Plan mode">
          <Switch
            accessibilityLabel="Plan mode"
            value={session.planMode}
            trackColor={switchTrack(theme)}
            onValueChange={(planMode) => onUpdate({ planMode })}
          />
        </SheetRow>
        <SheetRow label="Fast mode">
          <Switch
            accessibilityLabel="Fast mode"
            value={session.fast}
            trackColor={switchTrack(theme)}
            onValueChange={(fast) => onUpdate({ fast })}
          />
        </SheetRow>
      </Sheet>
    </>
  );
}
