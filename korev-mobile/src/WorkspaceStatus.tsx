import {
  Archive,
  GitBranch,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  MessageCircleQuestion,
  MessageSquareWarning,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import {
  prBadge,
  primaryPr,
  type PrBadge,
  type Workspace,
  type WorkspaceRuntime,
  type WorkspaceStatus,
} from '../../korev-desktop/src/shared/model';
import { attempt } from './attempt';
import { succeeded } from './haptics';
import { useConnection } from './korev';
import { ROW_ICON_SIZE } from './ListRow';
import { useTheme, type Theme } from './theme';
import { CHROME_FONT_SCALE } from './ui';

export const ARCHIVE_ACTION = 'archive';

const BUSY_STATUSES: ReadonlySet<WorkspaceStatus> = new Set([
  'creating',
  'setting-up',
  'working',
]);

const BADGE_ICONS: Record<PrBadge, LucideIcon> = {
  merged: GitMerge,
  closed: GitPullRequestClosed,
  conflicts: GitPullRequest,
  'checks-failing': GitPullRequest,
  review: MessageSquareWarning,
  'checks-running': GitPullRequest,
  draft: GitPullRequestDraft,
  open: GitPullRequest,
};

function badgeColor(theme: Theme, badge: PrBadge): string {
  const colors: Record<PrBadge, string> = {
    merged: theme.merged,
    closed: theme.fg4,
    conflicts: theme.warningText,
    'checks-failing': theme.dangerText,
    review: theme.warningText,
    'checks-running': theme.warningText,
    draft: theme.fg3,
    open: theme.successText,
  };
  return colors[badge];
}

export function StatusIcon({
  workspace,
  runtime,
}: {
  workspace: Workspace;
  runtime: WorkspaceRuntime;
}) {
  const theme = useTheme();
  if (BUSY_STATUSES.has(runtime.status))
    return <ActivityIndicator size="small" color={theme.accentText} />;
  if (runtime.status === 'waiting')
    return (
      <MessageCircleQuestion size={ROW_ICON_SIZE} color={theme.warningText} />
    );
  if (runtime.status === 'failed' || runtime.setupError)
    return <TriangleAlert size={ROW_ICON_SIZE} color={theme.dangerText} />;
  const pr = primaryPr(workspace, runtime);
  if (!pr) return <GitBranch size={ROW_ICON_SIZE} color={theme.fg4} />;
  const badge = prBadge(pr);
  const Badge = BADGE_ICONS[badge];
  return <Badge size={ROW_ICON_SIZE} color={badgeColor(theme, badge)} />;
}

export function useArchive(workspace: Workspace) {
  const { api } = useConnection();
  return async () =>
    succeeded(
      await attempt('Korev could not archive', () =>
        api.archiveWorkspace(workspace.id),
      ),
    );
}

export function SwipeToArchive({
  archive,
  background,
  children,
}: {
  archive: () => Promise<boolean>;
  background?: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const archiveFromSwipe = async (swipeable: SwipeableMethods) => {
    if (!(await archive())) swipeable.close();
  };
  return (
    <ReanimatedSwipeable
      overshootRight={false}
      childrenContainerStyle={{ backgroundColor: background ?? theme.bgApp }}
      renderRightActions={(_progress, _translation, swipeable) => (
        <Pressable
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.action}
          onPress={() => void archiveFromSwipe(swipeable)}
        >
          <Archive size={ROW_ICON_SIZE} color={theme.fgOnWarning} />
          <Text maxFontSizeMultiplier={CHROME_FONT_SCALE} style={styles.label}>
            Archive
          </Text>
        </Pressable>
      )}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    action: {
      justifyContent: 'center',
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: 20,
      backgroundColor: theme.warning,
    },
    label: { color: theme.fgOnWarning, fontSize: 12, fontWeight: '600' },
  });
}
