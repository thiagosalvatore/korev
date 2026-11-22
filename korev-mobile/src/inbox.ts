import {
  MERGE_STEPS,
  nextPrStep,
  PR_BADGE_LABELS,
  prBadge,
  primaryPr,
  type AppState,
  type PrStatus,
  type Workspace,
  type WorkspaceRuntime,
  type WorkspaceStatus,
} from '../../korev-desktop/src/shared/model';
import {
  activeWorkspaces,
  boardColumn,
  crossRepoLead,
  groupRepoName,
  prNeedsYou,
  waitsForLane,
} from '../../korev-desktop/src/shared/workspaces';

export type HomeSectionId = 'needs-you' | 'working' | 'ready' | 'other';

export interface HomeEntry {
  workspace: Workspace;
  runtime: WorkspaceRuntime | undefined;
  status: string;
}

export interface HomeSection {
  id: HomeSectionId;
  entries: HomeEntry[];
}

const SECTION_ORDER: HomeSectionId[] = [
  'needs-you',
  'working',
  'ready',
  'other',
];

const STATUS_TEXT: Partial<Record<WorkspaceStatus, string>> = {
  waiting: 'Needs your answer',
  creating: 'Creating the worktree',
  'setting-up': 'Running setup',
  working: 'Working',
  archiving: 'Archiving',
};

function readyToMerge(pr: PrStatus | null): boolean {
  return pr !== null && MERGE_STEPS.has(nextPrStep(pr));
}

function sectionOf(state: AppState, workspace: Workspace): HomeSectionId {
  const runtime = state.runtime[workspace.id];
  if (!runtime) return 'other';
  const column = boardColumn(runtime);
  if (column === 'needs-you' || column === 'working') return column;
  if (prNeedsYou(state, workspace)) return 'needs-you';
  return readyToMerge(primaryPr(workspace, runtime)) ? 'ready' : 'other';
}

function prStatus(pr: PrStatus): string {
  const label = readyToMerge(pr)
    ? 'Ready to merge'
    : PR_BADGE_LABELS[prBadge(pr)];
  return `${label} · #${pr.number}`;
}

function laneStatus(state: AppState, workspace: Workspace): string | null {
  if (!waitsForLane(state, workspace)) return null;
  const lead = crossRepoLead(state, workspace);
  return lead ? `Waits for the plan in ${groupRepoName(state, lead)}` : null;
}

function statusOf(state: AppState, workspace: Workspace): string {
  const runtime = state.runtime[workspace.id];
  const lane = laneStatus(state, workspace);
  if (lane) return lane;
  if (!runtime) return workspace.branch;
  if (runtime.status === 'failed') return runtime.message ?? 'Failed';
  const text = STATUS_TEXT[runtime.status];
  if (text) return text;
  if (runtime.setupError) return 'Setup failed';
  const pr = primaryPr(workspace, runtime);
  return pr ? prStatus(pr) : workspace.branch;
}

export function homeSections(state: AppState): HomeSection[] {
  const entries = activeWorkspaces(state).map((workspace) => ({
    section: sectionOf(state, workspace),
    entry: {
      workspace,
      runtime: state.runtime[workspace.id],
      status: statusOf(state, workspace),
    },
  }));
  return SECTION_ORDER.map((id) => ({
    id,
    entries: entries
      .filter((placed) => placed.section === id)
      .map((placed) => placed.entry),
  })).filter((section) => section.entries.length > 0);
}
