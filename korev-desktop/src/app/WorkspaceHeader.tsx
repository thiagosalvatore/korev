import { useState } from 'react';
import { Button, cn, Icon, IconButton, type IconName } from '../design-system';
import {
  primaryPr,
  type AppState,
  type PrStatus,
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
import { Menu } from './ui/Menu';
import { toast } from './ui/toast';
import { setUi, useUi } from './ui-store';

interface NextAction {
  label: string;
  icon: IconName;
  variant: 'primary' | 'secondary' | 'success' | 'danger';
  run: () => unknown;
}

function openPrStatus(
  pr: PrStatus,
  label: string,
  icon: IconName,
  variant: NextAction['variant'] = 'secondary',
): NextAction {
  return {
    label,
    icon,
    variant,
    run: () => void api.openExternal(pr.url),
  };
}

export function nextAction(
  state: AppState,
  workspace: Workspace,
  pr: PrStatus | null,
): NextAction {
  if (!pr || pr.state === 'CLOSED') {
    return {
      label: 'Create PR',
      icon: 'git-pull-request-arrow',
      variant: 'primary',
      run: () => createPr(workspace),
    };
  }
  if (pr.state === 'MERGED') {
    return {
      label: 'Archive',
      icon: 'archive',
      variant: 'secondary',
      run: () => archiveWorkspace(state, workspace),
    };
  }
  if (pr.mergeable === 'CONFLICTING') {
    return {
      label: 'Resolve conflicts',
      icon: 'git-compare-arrows',
      variant: 'danger',
      run: () => resolveConflicts(workspace, pr),
    };
  }
  if (pr.checks.some((check) => check.state === 'failure')) {
    return {
      label: 'Fix errors',
      icon: 'wrench',
      variant: 'danger',
      run: () => fixErrors(workspace, pr),
    };
  }
  if (pr.checks.some((check) => check.state === 'pending'))
    return openPrStatus(pr, 'Checks running', 'loader-circle');
  if (pr.isDraft) return openPrStatus(pr, 'Draft', 'git-pull-request-draft');
  if (pr.reviewDecision === 'CHANGES_REQUESTED')
    return openPrStatus(
      pr,
      'Changes requested',
      'message-square-warning',
      'danger',
    );
  if (pr.reviewDecision === 'REVIEW_REQUIRED')
    return openPrStatus(pr, 'Waiting for review', 'clock');
  return {
    label: 'Merge',
    icon: 'git-merge',
    variant: 'success',
    run: () => mergePr(workspace, pr),
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

export function WorkspaceHeader({
  state,
  workspace,
}: {
  state: AppState;
  workspace: Workspace;
}) {
  const sidebar = useUi((ui) => ui.sidebar);
  const panel = useUi((ui) => ui.panel);
  const runtime = state.runtime[workspace.id];
  const pr = primaryPr(workspace, runtime);
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
          <Button
            size="sm"
            variant="ghost"
            icon="git-pull-request"
            title="Open PR on GitHub"
            onClick={() => void api.openExternal(pr.url)}
          >
            #{pr.number}
          </Button>
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
