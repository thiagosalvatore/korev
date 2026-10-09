import { SlidersHorizontal } from 'lucide-react-native';
import { useState } from 'react';
import { Switch } from 'react-native';
import type {
  AppState,
  ChatSession,
  ModelChoice,
} from '../../../korev-desktop/src/shared/model';
import { ModelPicker } from '../ModelPicker';
import { Sheet, SheetRow } from '../PickerSheet';
import { useTheme } from '../theme';
import { ICON_BUTTON_ICON_SIZE, IconButton } from '../ui';

const TITLE = 'Chat options';

export function ComposerOptions({
  state,
  session,
  onTogglePlanMode,
  onChangeModel,
}: {
  state: AppState;
  session: ChatSession;
  onTogglePlanMode(): void;
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
        <SheetRow label="Plan mode">
          <Switch
            accessibilityLabel="Plan mode"
            value={session.planMode}
            onValueChange={onTogglePlanMode}
          />
        </SheetRow>
        <SheetRow label="Model">
          <ModelPicker
            state={state}
            agent={session.agent}
            model={session.model}
            onChange={onChangeModel}
          />
        </SheetRow>
      </Sheet>
    </>
  );
}
