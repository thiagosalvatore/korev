import { useEffect, useState, type ReactNode } from 'react';
import {
  Button,
  cn,
  Icon,
  Input,
  Select,
  Switch,
  type IconName,
} from '../design-system';
import {
  AGENT_KINDS,
  AGENT_LABELS,
  EFFORT_LEVELS,
  type AgentKind,
  type AppState,
  type Repo,
  type RepoConfig,
  type RepoConfigSource,
  type RepoScripts,
  type Settings,
  type ThemePreference,
} from '../shared/model';
import { api } from './bridge';
import { DRAG_REGION, TRAFFIC_LIGHT_GUTTER } from './layout';
import { toast } from './ui/toast';
import { setUi, useUi } from './ui-store';

interface Section {
  id: string;
  label: string;
  icon: IconName;
}

const SECTIONS: Section[] = [
  { id: 'general', label: 'General', icon: 'settings' },
  { id: 'models', label: 'Default models', icon: 'sparkles' },
  { id: 'agents', label: 'Agents', icon: 'bot' },
  { id: 'git', label: 'Git', icon: 'git-branch' },
  { id: 'storage', label: 'Storage', icon: 'hard-drive' },
  { id: 'shortcuts', label: 'Keyboard shortcuts', icon: 'keyboard' },
];

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function update(patch: Partial<Settings>) {
  void api.updateSettings(patch);
}

function Row({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-6 border-b border-border-1 py-4 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-fg-1">{title}</div>
        {description ? (
          <div className="mt-0.5 text-xs text-fg-3">{description}</div>
        ) : null}
      </div>
      <div className="flex-none">{children}</div>
    </div>
  );
}

function TextSetting({
  value,
  placeholder,
  mono,
  onSave,
}: {
  value: string;
  placeholder?: string;
  mono?: boolean;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <Input
      className="w-72"
      mono={mono}
      value={draft}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => draft !== value && onSave(draft)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
      }}
    />
  );
}

function General({ settings }: { settings: Settings }) {
  return (
    <>
      <Row title="Theme" description="Toggle with ⌘⌥T.">
        <Select
          ariaLabel="Theme"
          className="w-40"
          options={THEMES}
          value={settings.theme}
          onChange={(theme) => update({ theme: theme as ThemePreference })}
        />
      </Row>
      <Row
        title="Notifications"
        description="Notify when an agent finishes while Korev is in the background."
      >
        <Switch
          checked={settings.notifications}
          onChange={(notifications) => update({ notifications })}
        />
      </Row>
    </>
  );
}

function Models({ state }: { state: AppState }) {
  const { settings } = state;
  return (
    <>
      <Row title="Default agent" description="Used for new workspaces and ⌘T.">
        <Select
          ariaLabel="Default agent"
          className="w-48"
          options={AGENT_KINDS.map((agent) => ({
            value: agent,
            label: AGENT_LABELS[agent],
          }))}
          value={settings.defaultAgent}
          onChange={(agent) => update({ defaultAgent: agent as AgentKind })}
        />
      </Row>
      {AGENT_KINDS.map((agent) => {
        const models =
          state.agents.find((entry) => entry.agent === agent)?.models ?? [];
        return (
          <Row key={agent} title={`${AGENT_LABELS[agent]} model`}>
            <div className="flex gap-2">
              <Select
                ariaLabel={`${AGENT_LABELS[agent]} model`}
                className="w-44"
                options={models.map((model) => ({
                  value: model.id,
                  label: model.label,
                }))}
                value={settings.defaultModels[agent]}
                onChange={(model) =>
                  update({
                    defaultModels: {
                      ...settings.defaultModels,
                      [agent]: model,
                    },
                  })
                }
              />
              <Select
                ariaLabel={`${AGENT_LABELS[agent]} effort`}
                className="w-28"
                options={[...EFFORT_LEVELS[agent]]}
                value={settings.defaultEffort[agent]}
                onChange={(effort) =>
                  update({
                    defaultEffort: {
                      ...settings.defaultEffort,
                      [agent]: effort,
                    },
                  })
                }
              />
            </div>
          </Row>
        );
      })}
      <Row
        title="Start chats in plan mode"
        description="The agent plans before it edits. Toggle per message with ⇧Tab."
      >
        <Switch
          checked={settings.defaultPlanMode}
          onChange={(defaultPlanMode) => update({ defaultPlanMode })}
        />
      </Row>
    </>
  );
}

function Agents({ state }: { state: AppState }) {
  return (
    <>
      {state.agents.map((agent) => (
        <Row
          key={agent.agent}
          title={AGENT_LABELS[agent.agent]}
          description={
            agent.version
              ? `Using the ${agent.agent} CLI from your PATH (v${agent.version}). Sign-in and MCP servers come from its own config.`
              : `The ${agent.agent} CLI was not found on your PATH.`
          }
        >
          <span
            className={cn(
              'inline-flex items-center gap-1.5 text-xs',
              agent.version ? 'text-success-text' : 'text-danger-text',
            )}
          >
            <Icon
              name={agent.version ? 'circle-check' : 'circle-x'}
              size={13}
            />
            {agent.version ? 'Ready' : 'Not installed'}
          </span>
        </Row>
      ))}
      <p className="mt-3 mb-0 text-xs text-fg-3">
        Agents run with full permissions inside the workspace folder. A
        workspace is a git worktree, not a sandbox.
      </p>
    </>
  );
}

function Git({ settings }: { settings: Settings }) {
  return (
    <>
      <Row
        title="Branch prefix"
        description="New branches are named prefix/task-name. Leave empty to use your GitHub username."
      >
        <TextSetting
          value={settings.branchPrefix}
          placeholder="GitHub username"
          mono
          onSave={(branchPrefix) =>
            update({ branchPrefix: branchPrefix.trim() })
          }
        />
      </Row>
      <Row
        title="Name workspaces from the task"
        description="Let Claude Haiku name each workspace and branch from its task. When off, the first words of the task are used."
      >
        <Switch
          checked={settings.autoRenameBranches}
          onChange={(autoRenameBranches) => update({ autoRenameBranches })}
        />
      </Row>
      <Row
        title="Archive on merge"
        description="Archive a workspace when its pull request is merged. A repository can override this in .korev/settings.toml."
      >
        <Switch
          checked={settings.archiveOnMerge}
          onChange={(archiveOnMerge) => update({ archiveOnMerge })}
        />
      </Row>
      <Row
        title="Delete branch on archive"
        description="Remove the local branch when a workspace is archived."
      >
        <Switch
          checked={settings.deleteBranchOnArchive}
          onChange={(deleteBranchOnArchive) =>
            update({ deleteBranchOnArchive })
          }
        />
      </Row>
    </>
  );
}

function Storage({ settings }: { settings: Settings }) {
  return (
    <Row
      title="Workspaces location"
      description="New workspaces are created at <location>/<repo>/<task-name>."
    >
      <TextSetting
        value={settings.workspacesRoot}
        mono
        onSave={(workspacesRoot) => update({ workspacesRoot })}
      />
    </Row>
  );
}

const SHORTCUTS: [string, string][] = [
  ['⌘K', 'Command palette'],
  ['⌘N', 'New workspace'],
  ['⌘T', 'New chat'],
  ['⌘W', 'Close tab'],
  ['⌘1–9', 'Switch to workspace'],
  ['⌘⌥↑ / ⌘⌥↓', 'Previous / next workspace'],
  ['⌘B', 'Toggle left sidebar'],
  ['⌘⌥B', 'Toggle right sidebar'],
  ['⌘J', 'Toggle terminal'],
  ['⌘.', 'Zen mode'],
  ['⌘L', 'Focus chat input'],
  ['⇧Tab', 'Toggle plan mode'],
  ['⌘⇧⌫', 'Cancel agent'],
  ['⌘R', 'Start or stop run script'],
  ['⌘O', 'Open in app'],
  ['⌘⇧D', 'Open diff view'],
  ['⌘⇧P', 'Create PR'],
  ['⌘⇧M', 'Merge PR'],
  ['⌘⇧X', 'Fix errors'],
  ['⌘⇧A', 'Archive workspace'],
  ['⌘⌥T', 'Toggle theme'],
  ['⌘,', 'Settings'],
];

function Shortcuts() {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
      {SHORTCUTS.map(([keys, label]) => (
        <div key={label} className="contents">
          <span className="font-mono text-xs text-fg-2">{keys}</span>
          <span className="text-fg-1">{label}</span>
        </div>
      ))}
    </div>
  );
}

const SCRIPT_FIELDS: {
  key: 'setup' | 'run' | 'archive';
  label: string;
  hint: string;
}[] = [
  {
    key: 'setup',
    label: 'Setup script',
    hint: 'Runs in each new workspace, e.g. npm install.',
  },
  {
    key: 'run',
    label: 'Run script',
    hint: 'Started with the Run button (⌘R), e.g. npm run dev -- --port $KOREV_PORT.',
  },
  {
    key: 'archive',
    label: 'Archive script',
    hint: 'Runs before a workspace is archived.',
  },
];

const SOURCE_NOTICE: Record<RepoConfigSource, string | null> = {
  app: null,
  'korev.json':
    'This repository has a korev.json. Its scripts replace the ones below.',
  'settings.toml':
    'This repository has .korev/settings.toml. Its scripts, run scripts, preview URLs, prompts and git options replace the ones below.',
};

function ConfigSourceNotice({ repo }: { repo: Repo }) {
  const [config, setConfig] = useState<RepoConfig | null>(null);
  useEffect(() => {
    void api.repoConfig(repo.id).then(setConfig);
  }, [repo.id, repo.scripts]);
  const notice = config ? SOURCE_NOTICE[config.source] : null;
  if (!config || !notice) return null;
  return (
    <div className="mb-3 rounded-md bg-accent-subtle px-3 py-2 text-xs text-accent-text">
      <p className="m-0">{notice}</p>
      {config.runScripts.length ? (
        <p className="m-0 mt-1 font-mono">
          Run scripts:{' '}
          {config.runScripts
            .map(
              (script) => `${script.id}${script.isDefault ? ' (default)' : ''}`,
            )
            .join(', ')}
        </p>
      ) : null}
    </div>
  );
}

function RepoSettings({ state, repo }: { state: AppState; repo: Repo }) {
  const [scripts, setScripts] = useState<RepoScripts>(repo.scripts);
  const [confirmRemove, setConfirmRemove] = useState(false);
  useEffect(() => setScripts(repo.scripts), [repo.id, repo.scripts]);
  const dirty = JSON.stringify(scripts) !== JSON.stringify(repo.scripts);
  const workspaceCount = state.workspaces.filter(
    (ws) => ws.repoId === repo.id,
  ).length;
  return (
    <>
      <Row
        title="Path"
        description={<span className="font-mono">{repo.path}</span>}
      >
        <Button
          size="sm"
          variant="secondary"
          icon="copy"
          onClick={() => {
            void navigator.clipboard.writeText(repo.path);
            toast('Path copied');
          }}
        >
          Copy
        </Button>
      </Row>
      <Row
        title="Default branch"
        description="New workspaces branch from origin/<default branch>."
      >
        <TextSetting
          value={repo.defaultBranch}
          mono
          onSave={(defaultBranch) =>
            void api.updateRepo(repo.id, { defaultBranch })
          }
        />
      </Row>
      <div className="py-4">
        <div className="text-sm font-medium text-fg-1">Scripts</div>
        <p className="mt-0.5 mb-3 text-xs text-fg-3">
          A <span className="font-mono">.korev/settings.toml</span> (or{' '}
          <span className="font-mono">korev.json</span>) in the repository
          overrides these. Scripts get KOREV_WORKSPACE_NAME,
          KOREV_WORKSPACE_PATH, KOREV_ROOT_PATH, KOREV_DEFAULT_BRANCH,
          KOREV_WORKSPACE_ID and KOREV_PORT (the first of 10 ports).
        </p>
        <ConfigSourceNotice repo={repo} />
        <div className="flex flex-col gap-3">
          {SCRIPT_FIELDS.map((field) => (
            <label key={field.key} className="flex flex-col gap-1">
              <span className="text-xs font-medium text-fg-2">
                {field.label}
              </span>
              <textarea
                aria-label={field.label}
                value={scripts[field.key]}
                rows={2}
                placeholder={field.hint}
                className="resize-y rounded-sm border border-border-2 bg-inset px-2.5 py-2 font-mono text-xs text-fg-1 outline-none focus:border-accent-border"
                onChange={(event) =>
                  setScripts({ ...scripts, [field.key]: event.target.value })
                }
              />
            </label>
          ))}
          <label className="flex items-center gap-3 text-sm text-fg-2">
            <Switch
              checked={scripts.runMode === 'nonconcurrent'}
              onChange={(nonconcurrent) =>
                setScripts({
                  ...scripts,
                  runMode: nonconcurrent ? 'nonconcurrent' : 'concurrent',
                })
              }
            />
            Stop other workspaces' run scripts when one starts
          </label>
          <div>
            <Button
              size="sm"
              variant="primary"
              disabled={!dirty}
              onClick={async () => {
                await api.updateRepoScripts(repo.id, scripts);
                toast('Scripts saved', 'success');
              }}
            >
              Save scripts
            </Button>
          </div>
        </div>
      </div>
      <Row
        title="Remove repository"
        description={`This deletes its ${workspaceCount} workspace${workspaceCount === 1 ? '' : 's'} and their chats. The repository folder itself stays.`}
      >
        {confirmRemove ? (
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmRemove(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={async () => {
                await api.removeRepo(repo.id);
                setUi({ page: { kind: 'settings', section: 'general' } });
              }}
            >
              Remove
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="danger"
            onClick={() => setConfirmRemove(true)}
          >
            Remove
          </Button>
        )}
      </Row>
    </>
  );
}

function NavButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: IconName;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-7 w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2 text-left text-sm text-fg-2 hover:bg-hover hover:text-fg-1',
        active && 'bg-active text-fg-1',
      )}
      onClick={onClick}
    >
      <Icon name={icon} size={14} className="text-fg-3" />
      <span className="truncate">{label}</span>
    </button>
  );
}

export function SettingsPage({
  state,
  section,
}: {
  state: AppState;
  section: string;
}) {
  const sidebar = useUi((ui) => ui.sidebar);
  const repo = section.startsWith('repo:')
    ? state.repos.find((entry) => `repo:${entry.id}` === section)
    : null;
  const current =
    SECTIONS.find((entry) => entry.id === section) ??
    (repo ? null : SECTIONS[0]);
  const go = (id: string) => setUi({ page: { kind: 'settings', section: id } });

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !(
          event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLTextAreaElement
        )
      ) {
        setUi({ page: { kind: 'workspace' } });
      }
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);

  let body: ReactNode = null;
  if (repo) body = <RepoSettings state={state} repo={repo} />;
  else if (current?.id === 'general')
    body = <General settings={state.settings} />;
  else if (current?.id === 'models') body = <Models state={state} />;
  else if (current?.id === 'agents') body = <Agents state={state} />;
  else if (current?.id === 'git') body = <Git settings={state.settings} />;
  else if (current?.id === 'storage')
    body = <Storage settings={state.settings} />;
  else if (current?.id === 'shortcuts') body = <Shortcuts />;

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div
        className={cn(
          'flex h-11 flex-none items-center border-b border-border-1 px-4',
          DRAG_REGION,
          !sidebar && TRAFFIC_LIGHT_GUTTER,
        )}
      >
        <span className="text-sm font-semibold text-fg-1">Settings</span>
      </div>
      <div className="flex min-h-0 flex-1">
        <nav
          aria-label="Settings sections"
          className="flex w-56 flex-none flex-col gap-0.5 overflow-y-auto border-r border-border-1 p-2"
        >
          {SECTIONS.map((entry) => (
            <NavButton
              key={entry.id}
              active={current?.id === entry.id}
              icon={entry.icon}
              label={entry.label}
              onClick={() => go(entry.id)}
            />
          ))}
          <div className="mt-4 mb-1 px-2 type-overline text-fg-4">
            Repositories
          </div>
          {state.repos.map((entry) => (
            <NavButton
              key={entry.id}
              active={repo?.id === entry.id}
              icon="folder-git-2"
              label={entry.name}
              onClick={() => go(`repo:${entry.id}`)}
            />
          ))}
        </nav>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[720px] px-8 py-8">
            <h1 className="m-0 mb-4 type-h2 text-fg-1">
              {repo ? repo.name : current?.label}
            </h1>
            {body}
          </div>
        </div>
      </div>
    </div>
  );
}
