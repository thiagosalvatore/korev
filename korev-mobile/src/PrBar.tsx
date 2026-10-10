import { useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { KorevApi } from '../../korev-desktop/src/shared/api';
import {
  MERGE_STEPS,
  nextPrStep,
  PR_STEPS,
  primaryPr,
  type CheckState,
  type PrStatus,
  type PrStep,
  type Workspace,
  type WorkspaceRuntime,
} from '../../korev-desktop/src/shared/model';
import { attempt } from './attempt';
import { usePendingAction } from './hooks';
import { succeeded } from './haptics';
import { useConnection } from './korev';
import { useTheme, type Theme } from './theme';
import { Button, CHROME_FONT_SCALE, MIN_TOUCH_TARGET } from './ui';

const PROMPT_STEPS: ReadonlySet<PrStep> = new Set([
  'create',
  'fix-errors',
  'resolve-conflicts',
]);

const CHECK_MARKS: Record<CheckState, string> = {
  success: '✓',
  failure: '✕',
  pending: '◌',
  skipped: '–',
};

function confirm(
  title: string,
  message: string | undefined,
  action: string,
): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: action, onPress: () => resolve(true) },
    ]),
  );
}

async function confirmThenRun(
  title: string,
  message: string | undefined,
  action: string,
  failure: string,
  run: () => Promise<unknown>,
) {
  if (!(await confirm(title, message, action))) return;
  succeeded(await attempt(failure, run));
}

function runStep(
  api: KorevApi,
  step: PrStep,
  workspace: Workspace,
  pr: PrStatus | null,
  sessionId: string,
) {
  const label = PR_STEPS[step].label;
  const failure = `Korev could not ${label.toLowerCase()}`;
  if (!pr || step === 'create')
    return attempt(failure, () => api.createPr(workspace.id, sessionId)).then(
      succeeded,
    );
  if (step === 'fix-errors')
    return attempt(failure, () =>
      api.fixChecks(workspace.id, sessionId, pr.number),
    );
  if (step === 'resolve-conflicts')
    return attempt(failure, () =>
      api.resolveConflicts(workspace.id, sessionId, pr.number),
    );
  if (MERGE_STEPS.has(step))
    return confirmThenRun(
      `Merge #${pr.number}?`,
      `Squash merge "${pr.title}" into ${pr.baseRefName}.`,
      label,
      failure,
      () => api.mergePr(workspace.id, pr.number),
    );
  if (step === 'archive')
    return confirmThenRun(
      `Archive ${workspace.name}?`,
      undefined,
      label,
      failure,
      () => api.archiveWorkspace(workspace.id),
    );
  return Linking.openURL(pr.url);
}

function checkColor(theme: Theme, state: CheckState): string {
  if (state === 'success') return theme.successText;
  if (state === 'failure') return theme.dangerText;
  if (state === 'pending') return theme.warningText;
  return theme.fg4;
}

export function PrBar({
  workspace,
  runtime,
  sessionId,
}: {
  workspace: Workspace;
  runtime: WorkspaceRuntime | undefined;
  sessionId: string | undefined;
}) {
  const { api } = useConnection();
  const theme = useTheme();
  const styles = makeStyles(theme);
  const [showChecks, setShowChecks] = useState(false);
  const { pending, run } = usePendingAction();
  const pr = primaryPr(workspace, runtime);
  const step = nextPrStep(pr);
  const needsChat = PROMPT_STEPS.has(step);

  return (
    <View style={styles.panel}>
      <View style={styles.bar}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{
            expanded: showChecks,
            disabled: !pr?.checks.length,
          }}
          style={styles.info}
          disabled={!pr?.checks.length}
          onPress={() => setShowChecks(!showChecks)}
        >
          <Text
            maxFontSizeMultiplier={CHROME_FONT_SCALE}
            style={styles.title}
            numberOfLines={1}
          >
            {pr ? `#${pr.number} ${pr.title}` : 'No pull request'}
          </Text>
          <Text
            maxFontSizeMultiplier={CHROME_FONT_SCALE}
            style={styles.meta}
            numberOfLines={1}
          >
            {workspace.branch} → {workspace.baseBranch}
            {pr?.checks.length ? ` · ${pr.checks.length} checks` : ''}
          </Text>
        </Pressable>
        <Button
          label={PR_STEPS[step].label}
          variant={PR_STEPS[step].tone}
          pending={pending !== null}
          disabled={needsChat && !sessionId}
          onPress={() =>
            void run(step, () =>
              runStep(api, step, workspace, pr, sessionId ?? ''),
            )
          }
        />
      </View>
      {runtime?.message ? (
        <Text style={styles.message}>{runtime.message}</Text>
      ) : null}
      {showChecks &&
        pr?.checks.map((check) => (
          <Pressable
            key={check.name}
            accessibilityRole="link"
            style={styles.checkRow}
            disabled={!check.url}
            onPress={() => check.url && void Linking.openURL(check.url)}
          >
            <Text
              style={[styles.check, { color: checkColor(theme, check.state) }]}
            >
              {CHECK_MARKS[check.state]} {check.name}
            </Text>
          </Pressable>
        ))}
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    panel: {
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border1,
      backgroundColor: theme.bgSurface,
    },
    bar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    info: { flex: 1, gap: 2 },
    title: { color: theme.fg1, fontSize: 14, fontWeight: '600' },
    meta: { color: theme.fg3, fontSize: 12 },
    checkRow: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
    check: { fontSize: 13 },
    message: { color: theme.dangerText, fontSize: 13, lineHeight: 19 },
  });
}
