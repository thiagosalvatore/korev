import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { asksWaitingForYou } from '../../../../korev-desktop/src/shared/workspaces';
import { useAppState } from '../../hooks';
import { openNewWorkspace } from '../../navigation';
import { useOpenTappedWorkspace } from '../../push';
import { useTheme } from '../../theme';

function badgeText(count: number) {
  return count ? String(count) : null;
}

export default function TabsLayout() {
  const theme = useTheme();
  const state = useAppState();
  useOpenTappedWorkspace();
  const waitingWorkspaces = state
    ? Object.values(state.runtime).filter((entry) => entry.status === 'waiting')
        .length
    : 0;
  const waitingAsks = state ? asksWaitingForYou(state).length : 0;
  const workspacesBadge = badgeText(waitingWorkspaces);
  const asksBadge = badgeText(waitingAsks);

  return (
    <NativeTabs
      tintColor={theme.accentText}
      badgeBackgroundColor={theme.warning}
      badgeTextColor={theme.fgOnWarning}
    >
      <NativeTabs.Trigger name="(workspaces)">
        <NativeTabs.Trigger.Label>Workspaces</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="square.stack.3d.up" md="layers" />
        {workspacesBadge ? (
          <NativeTabs.Trigger.Badge>{workspacesBadge}</NativeTabs.Trigger.Badge>
        ) : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(ask)">
        <NativeTabs.Trigger.Label>Ask</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="questionmark.bubble" md="help" />
        {asksBadge ? (
          <NativeTabs.Trigger.Badge>{asksBadge}</NativeTabs.Trigger.Badge>
        ) : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(pulls)">
        <NativeTabs.Trigger.Label>Pull requests</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="arrow.triangle.pull" md="merge" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        name="create"
        role="search"
        disabled
        listeners={{ tabPress: () => openNewWorkspace() }}
      >
        <NativeTabs.Trigger.Label>New workspace</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="plus" md="add" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
