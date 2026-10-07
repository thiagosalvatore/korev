import { useState } from 'react';
import { Button, cn, Icon, IconButton, type IconName } from '../design-system';
import {
  MERGE_STEPS,
  nextPrStep,
  PR_STEPS,
  primaryPr,
  type AppState,
  type PrStatus,
  type PrStep,
  type PrStepTone,
  type Workspace,
} from '../shared/model';
import {
  archiveWorkspace,
  createPr,
  fixErrors,
  mergePr,
  openIn,
  resolveConflicts,
} from './actions';
import { api } from './bridge';
import { DRAG_REGION, NO_DRAG, TRAFFIC_LIGHT_GUTTER } from './layout';
import { prIcon } from './Sidebar';
import { Menu } from './ui/Menu';
import { toast } from './ui/toast';
import { setUi, updateWorkspaceUi, useUi } from './ui-store';

interface NextAction {
  label: string;
  icon: IconName;
  variant: PrStepTone;
  run: () => unknown;
}

const STEP_ICONS: Record<PrStep, IconName> = {
  create: 'git-pull-request-arrow',
  archive: 'archive',
  'resolve-conflicts': 'git-compare-arrows',
  'fix-errors': 'wrench',
  'checks-running': 'loader-circle',
  draft: 'git-pull-request-draft',
  'changes-requested': 'message-square-warning',
  'waiting-for-review': 'clock',
  'stack-blocked': 'layers',
  merge: 'git-merge',
  'merge-partial-stack': 'git-merge',
  'merge-stack': 'git-merge',
};

function stepRun(
  step: PrStep,
  state: AppState,
  workspace: Workspace,
  pr: PrStatus | null,
): () => unknown {
  if (!pr || step === 'create') return () => createPr(workspace);
  if (step === 'archive') return () => archiveWorkspace(state, workspace);
  if (step === 'resolve-conflicts')
    return () => resolveConflicts(workspace, pr);
  if (step === 'fix-errors') return () => fixErrors(workspace, pr);
  if (MERGE_STEPS.has(step)) return () => mergePr(workspace, pr);
  return () => void api.openExternal(pr.url);
}

export function nextAction(
  state: AppState,
  workspace: Workspace,
  pr: PrStatus | null,
): NextAction {
  const step = nextPrStep(pr);
  return {
    label: PR_STEPS[step].label,
    icon: STEP_ICONS[step],
    variant: PR_STEPS[step].tone,
    run: stepRun(step, state, workspace, pr),
  };
}

const EDITOR_ICONS: Record<string, IconName> = {
  finder: 'folder',
  terminal: 'square-terminal',
  iterm: 'square-terminal',
  ghostty: 'square-terminal',
  warp: 'square-terminal',
};

function TargetBranch({ workspace }: { workspace: Workspace }) {
  const [branches, setBranches] = useState<string[]>([]);
  return (
    <Menu
      label="Target branch"
      items={(branches.length ? branches : [workspace.baseBranch]).map(
        (branch) => ({
          id: branch,
          label: branch,
          checked: branch === workspace.baseBranch,
          onSelect: () => void api.setBaseBranch(workspace.id, branch),
        }),
      )}
      trigger={({ toggle }) => (
        <button
          type="button"
          title="Change target branch"
          className="flex cursor-pointer items-center gap-1 rounded-sm border-0 bg-transparent px-1 py-0.5 font-mono text-xs text-fg-4 hover:bg-hover hover:text-fg-1"
          onClick={() => {
            if (!branches.length)
              void api.listBranches(workspace.repoId).then(setBranches);
            toggle();
          }}
        >
          <Icon name="arrow-right" size={12} />
          origin/{workspace.baseBranch}
        </button>
      )}
    />
  );
}

function PrButton({
  workspace,
  pr,
  prs,
}: {
  workspace: Workspace;
  pr: PrStatus;
  prs: PrStatus[];
}) {
  const open = (
    <Button
      size="sm"
      variant="ghost"
      icon="git-pull-request"
      title="Open PR on GitHub"
      className={prs.length > 1 ? 'rounded-r-none' : undefined}
      onClick={() => void api.openExternal(pr.url)}
    >
      #{pr.number}
    </Button>
  );
  if (prs.length < 2) return open;
  return (
    <div className="flex items-center">
      {open}
      <Menu
        label="Pull requests"
        align="right"
        items={prs.map((entry) => ({
          id: entry.url,
          label: `#${entry.number} ${entry.title}`,
          icon: prIcon(entry).icon,
          checked: entry.url === pr.url,
          onSelect: () =>
            updateWorkspaceUi(workspace.id, () => ({ prUrl: entry.url })),
        }))}
        trigger={({ toggle }) => (
          <Button
            size="sm"
            variant="ghost"
            className="-ml-px rounded-l-none px-1.5"
            aria-label="Choose pull request"
            onClick={toggle}
          >
            <Icon name="chevron-down" size={13} />
          </Button>
        )}
      />
    </div>
  );
}

export function WorkspaceHeader({
  state,
  workspace,
}: {
  state: AppState;
  workspace: Workspace;
}) {
  const sidebar = useUi((ui) => ui.sidebar);
  const panel = useUi((ui) => ui.panel);
  const prUrl = useUi((ui) => ui.workspaces[workspace.id]?.prUrl);
  const runtime = state.runtime[workspace.id];
  const pr = primaryPr(workspace, runtime, prUrl);
  const action = nextAction(state, workspace, pr);
  const editor =
    state.editors.find((entry) => entry.id === state.settings.editor) ??
    state.editors[0];
  return (
    <header
      className={cn(
        'flex h-11 flex-none items-center gap-2 border-b border-border-1 bg-app pr-2',
        DRAG_REGION,
        sidebar ? 'pl-3' : TRAFFIC_LIGHT_GUTTER,
      )}
    >
      {sidebar ? null : (
        <IconButton
          icon="panel-left"
          label="Show sidebar"
          size="sm"
          className={NO_DRAG}
          onClick={() => setUi({ sidebar: true })}
        />
      )}
      <div className={cn('flex min-w-0 items-center gap-2', NO_DRAG)}>
        <span className="text-sm font-semibold text-fg-1">
          {workspace.name}
        </span>
        <Icon name="chevron-right" size={13} className="text-fg-4" />
        <button
          type="button"
          title="Copy branch name"
          className="flex min-w-0 cursor-pointer items-center gap-1.5 rounded-sm border-0 bg-transparent px-1 py-0.5 font-mono text-xs text-fg-2 hover:bg-hover"
          onClick={() => {
            void navigator.clipboard.writeText(workspace.branch);
            toast('Branch name copied');
          }}
        >
          <Icon name="git-branch" size={13} className="text-fg-3" />
          <span className="truncate">{workspace.branch}</span>
        </button>
        <TargetBranch workspace={workspace} />
      </div>
      <div className="flex-1" />
      <div className={cn('flex items-center gap-1.5', NO_DRAG)}>
        {editor ? (
          <div className="flex items-center">
            <Button
              size="sm"
              variant="secondary"
              icon={EDITOR_ICONS[editor.id] ?? 'code'}
              className="rounded-r-none"
              title={`Open in ${editor.label} (⌘O)`}
              onClick={() => openIn(workspace, editor.id)}
            >
              Open
            </Button>
            <Menu
              label="Open in"
              align="right"
              items={state.editors.map((entry) => ({
                id: entry.id,
                label: entry.label,
                icon: EDITOR_ICONS[entry.id] ?? 'code',
                checked: entry.id === editor.id,
                onSelect: () => {
                  void api.updateSettings({ editor: entry.id });
                  void openIn(workspace, entry.id);
                },
              }))}
              trigger={({ toggle }) => (
                <Button
                  size="sm"
                  variant="secondary"
                  className="-ml-px rounded-l-none px-1.5"
                  aria-label="Choose app"
                  onClick={toggle}
                >
                  <Icon name="chevron-down" size={13} />
                </Button>
              )}
            />
          </div>
        ) : null}
        {pr ? (
          <PrButton workspace={workspace} pr={pr} prs={runtime?.prs ?? []} />
        ) : null}
        <Button
          size="sm"
          variant={action.variant}
          icon={action.icon}
          onClick={action.run}
        >
          {action.label}
        </Button>
        <IconButton
          icon={panel ? 'panel-right-close' : 'panel-right-open'}
          label={panel ? 'Hide right sidebar' : 'Show right sidebar'}
          size="sm"
          onClick={() => setUi({ panel: !panel })}
        />
      </div>
    </header>
  );
}
