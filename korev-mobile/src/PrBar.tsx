import { router } from 'expo-router';
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
import { useConnection } from './korev';
import { useTheme, type Theme } from './theme';
import { Button } from './ui';

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

function confirm(title: string, action: string, onConfirm: () => void) {
  Alert.alert(title, undefined, [
    { text: 'Cancel', style: 'cancel' },
    { text: action, onPress: onConfirm },
  ]);
}

function confirmThenLeave(
  title: string,
  action: string,
  failure: string,
  run: () => Promise<unknown>,
) {
  confirm(
    title,
    action,
    () => void attempt(failure, run).then((done) => done && router.back()),
  );
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
    return void attempt(failure, () => api.createPr(workspace.id, sessionId));
  if (step === 'fix-errors')
    return void attempt(failure, () =>
      api.fixChecks(workspace.id, sessionId, pr.number),
    );
  if (step === 'resolve-conflicts')
    return void attempt(failure, () =>
      api.resolveConflicts(workspace.id, sessionId, pr.number),
    );
  if (MERGE_STEPS.has(step))
    return confirmThenLeave(`Merge #${pr.number}?`, label, failure, () =>
      api.mergePr(workspace.id, pr.number),
    );
  if (step === 'archive')
    return confirmThenLeave(`Archive ${workspace.name}?`, label, failure, () =>
      api.archiveWorkspace(workspace.id),
    );
  void Linking.openURL(pr.url);
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
  const pr = primaryPr(workspace, runtime);
  const step = nextPrStep(pr);
  const needsChat = PROMPT_STEPS.has(step);

  return (
    <View style={styles.panel}>
      <View style={styles.bar}>
        <Pressable
          style={styles.info}
          disabled={!pr?.checks.length}
          onPress={() => setShowChecks(!showChecks)}
        >
          <Text style={styles.title} numberOfLines={1}>
            {pr ? `#${pr.number} ${pr.title}` : 'No pull request'}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {workspace.branch} → {workspace.baseBranch}
            {pr?.checks.length ? ` · ${pr.checks.length} checks` : ''}
          </Text>
        </Pressable>
        <Button
          label={PR_STEPS[step].label}
          variant={PR_STEPS[step].tone}
          disabled={needsChat && !sessionId}
          onPress={() => runStep(api, step, workspace, pr, sessionId ?? '')}
        />
      </View>
      {showChecks &&
        pr?.checks.map((check) => (
          <Pressable
            key={check.name}
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
    check: { fontSize: 13, paddingVertical: 2 },
  });
}
