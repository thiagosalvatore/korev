import { Alert, Linking } from 'react-native';
import type { KorevApi } from '../../korev-desktop/src/shared/api';
import {
  MERGE_STEPS,
  PR_STEPS,
  type PrStatus,
  type PrStep,
  type Workspace,
  type WorkspaceRuntime,
} from '../../korev-desktop/src/shared/model';
import { workspaceLabel } from '../../korev-desktop/src/shared/workspaces';
import { attempt } from './attempt';
import { succeeded } from './haptics';

export const PROMPT_STEPS: ReadonlySet<PrStep> = new Set([
  'create',
  'fix-errors',
  'resolve-conflicts',
]);

export const FLOATING_STEPS: ReadonlySet<PrStep> = new Set([
  ...MERGE_STEPS,
  'fix-errors',
  'resolve-conflicts',
]);

export const ACTION_STEPS: ReadonlySet<PrStep> = new Set([
  ...FLOATING_STEPS,
  'create',
  'archive',
]);

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

export function stepLabel(step: PrStep, pr: PrStatus | null): string {
  const label = PR_STEPS[step].label;
  return pr && MERGE_STEPS.has(step) ? `${label} #${pr.number}` : label;
}

export function archiveWorkspace(api: KorevApi, workspace: Workspace) {
  return confirmThenRun(
    `Archive ${workspaceLabel(workspace)}?`,
    undefined,
    PR_STEPS.archive.label,
    'Korev could not archive the workspace',
    () => api.archiveWorkspace(workspace.id),
  );
}

export function runStep(
  api: KorevApi,
  step: PrStep,
  workspace: Workspace,
  pr: PrStatus | null,
  sessionId: string,
) {
  const label = PR_STEPS[step].label;
  const failure = `Korev could not ${label.toLowerCase()}`;
  if (step === 'archive') return archiveWorkspace(api, workspace);
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
  return Linking.openURL(pr.url);
}

export function hasChanges(runtime: WorkspaceRuntime | undefined): boolean {
  const stats = runtime?.stats;
  return Boolean(runtime?.prs.length || stats?.additions || stats?.deletions);
}
