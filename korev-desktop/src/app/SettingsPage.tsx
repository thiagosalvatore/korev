import { useEffect, useState, type ReactNode } from 'react';
import {
  Button,
  cn,
  Dialog,
  Icon,
  IconButton,
  Input,
  Select,
  Switch,
  type IconName,
} from '../design-system';
import {
  AGENT_KINDS,
  AGENT_LABELS,
  DEFAULT_INCLUDE_GLOBS,
  EFFORT_LEVELS,
  LOADOUT_SIZE,
  loadoutKey,
  type AgentKind,
  type AppRunScript,
  type AppState,
  type DictationLanguage,
  type DictationStatus,
  type PromptKind,
  type RemotePairing,
  type RemoteStatus,
  type Repo,
  type RepoConfig,
  type RepoConfigSource,
  type RepoPrompts,
  type RepoScripts,
  type Settings,
  type Skill,
  type ThemePreference,
} from '../shared/model';
import { api } from './bridge';
import { modelChoices } from '../shared/format';
import { DRAG_REGION, TRAFFIC_LIGHT_GUTTER } from './layout';
import { QrCode } from './QrCode';
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
  { id: 'remote', label: 'Remote access', icon: 'smartphone' },
  { id: 'voice', label: 'Voice input', icon: 'mic' },
  { id: 'snippets', label: 'Snippets', icon: 'text-quote' },
  { id: 'shortcuts', label: 'Keyboard shortcuts', icon: 'keyboard' },
];

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const DICTATION_LANGUAGES: { value: DictationLanguage; label: string }[] = [
  { value: 'auto', label: 'Detect' },
  { value: 'pt', label: 'Português' },
  { value: 'en', label: 'English' },
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

function importSummary(imported: { repos: number; settings: number }) {
  const { repos, settings } = imported;
  const parts = [
    repos
      ? `${repos} ${repos === 1 ? 'repository' : 'repositories'} added`
      : '',
    settings ? `${settings} setting${settings === 1 ? '' : 's'} updated` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Nothing to import';
}

async function importFromConductor() {
  toast(importSummary(await api.importFromConductor()), 'success');
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
      <Row
        title="Phone notifications"
        description="Also sends these notifications to an ntfy topic, for example https://ntfy.sh/<topic>. Pick a topic name that nobody can guess. Leave it empty to turn this off."
      >
        <TextSetting
          value={settings.phoneNotificationsUrl}
          placeholder="https://ntfy.sh/<topic>"
          mono
          onSave={(phoneNotificationsUrl) =>
            update({ phoneNotificationsUrl: phoneNotificationsUrl.trim() })
          }
        />
      </Row>
      <Row
        title="Sound"
        description="Play a sound when an agent finishes or needs your input in a workspace you are not looking at."
      >
        <Switch
          checked={settings.notificationSound}
          onChange={(notificationSound) => update({ notificationSound })}
        />
      </Row>
      <Row
        title="Keep Mac awake"
        description="Stop your Mac from sleeping while an agent is working. The display can still turn off."
      >
        <Switch
          checked={settings.keepAwake}
          onChange={(keepAwake) => update({ keepAwake })}
        />
      </Row>
      <Row
        title="Import from Conductor"
        description="Adds Conductor's repositories and copies its git and model preferences. Repositories keep using their .conductor/settings.toml."
      >
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void importFromConductor()}
        >
          Import
        </Button>
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
      <ReviewModel state={state} />
      <Loadout state={state} />
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

const SAME_AS_CHATS = '';

function ReviewModel({ state }: { state: AppState }) {
  const { reviewModel, defaultAgent, defaultEffort } = state.settings;
  const choices = modelChoices(state, reviewModel?.agent ?? defaultAgent);
  const choose = (key: string) => {
    const choice = choices.find(
      (entry) => loadoutKey(entry.agent, entry.id) === key,
    );
    update({
      reviewModel: choice
        ? {
            agent: choice.agent,
            model: choice.id,
            effort: defaultEffort[choice.agent],
          }
        : null,
    });
  };
  return (
    <Row
      title="Review model"
      description="Runs the Review button. Same as chats uses the default agent and its model."
    >
      <div className="flex gap-2">
        <Select
          ariaLabel="Review model"
          className="w-56"
          options={[
            { value: SAME_AS_CHATS, label: 'Same as chats' },
            ...choices.map((choice) => ({
              value: loadoutKey(choice.agent, choice.id),
              label: `${AGENT_LABELS[choice.agent]} · ${choice.label}`,
            })),
          ]}
          value={
            reviewModel
              ? loadoutKey(reviewModel.agent, reviewModel.model)
              : SAME_AS_CHATS
          }
          onChange={choose}
        />
        {reviewModel ? (
          <Select
            ariaLabel="Review effort"
            className="w-28"
            options={[...EFFORT_LEVELS[reviewModel.agent]]}
            value={reviewModel.effort}
            onChange={(effort) =>
              update({ reviewModel: { ...reviewModel, effort } })
            }
          />
        ) : null}
      </div>
    </Row>
  );
}

function Loadout({ state }: { state: AppState }) {
  const { loadout } = state.settings;
  const options = AGENT_KINDS.flatMap((agent) =>
    (state.agents.find((entry) => entry.agent === agent)?.models ?? []).map(
      (model) => ({
        key: loadoutKey(agent, model.id),
        label: `${AGENT_LABELS[agent]} · ${model.label}`,
      }),
    ),
  );
  const toggle = (key: string) => {
    if (loadout.includes(key))
      return update({ loadout: loadout.filter((entry) => entry !== key) });
    if (loadout.length >= LOADOUT_SIZE)
      return toast(`A loadout holds up to ${LOADOUT_SIZE} models`);
    return update({ loadout: [...loadout, key] });
  };
  return (
    <div className="border-b border-border-1 py-4">
      <div className="text-sm font-medium text-fg-1">Loadout</div>
      <div className="mt-0.5 mb-2 text-xs text-fg-3">
        Up to {LOADOUT_SIZE} favourite models. They sit at the top of the model
        picker, and ⌃⌘1–{LOADOUT_SIZE} picks them while typing.
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const position = loadout.indexOf(option.key);
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={position !== -1}
              className={cn(
                'flex h-7 cursor-pointer items-center gap-1.5 rounded-sm border border-border-2 bg-raised px-2 text-xs text-fg-2 hover:border-border-strong',
                position !== -1 &&
                  'border-accent-border bg-accent-subtle text-accent-text',
              )}
              onClick={() => toggle(option.key)}
            >
              {position !== -1 ? (
                <span className="font-mono">⌃⌘{position + 1}</span>
              ) : null}
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Snippets({ settings }: { settings: Settings }) {
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const add = () => {
    update({ snippets: [...settings.snippets, { name: name.trim(), text }] });
    setName('');
    setText('');
  };
  return (
    <>
      <p className="mt-0 mb-4 text-sm text-fg-3">
        Press ⌘; in the composer to insert one.
      </p>
      {settings.snippets.map((snippet, index) => (
        <Row
          key={`${snippet.name}-${index}`}
          title={snippet.name}
          description={
            <span className="line-clamp-2 font-mono">{snippet.text}</span>
          }
        >
          <Button
            size="sm"
            variant="ghost"
            icon="trash-2"
            onClick={() =>
              update({
                snippets: settings.snippets.filter(
                  (_, position) => position !== index,
                ),
              })
            }
          >
            Remove
          </Button>
        </Row>
      ))}
      <div className="flex flex-col gap-2 py-4">
        <Input
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <textarea
          aria-label="Snippet text"
          value={text}
          rows={4}
          placeholder="Text to insert"
          className="resize-y rounded-sm border border-border-2 bg-inset px-2.5 py-2 font-mono text-xs text-fg-1 outline-none focus:border-accent-border"
          onChange={(event) => setText(event.target.value)}
        />
        <div>
          <Button
            size="sm"
            variant="primary"
            icon="plus"
            disabled={!name.trim() || !text.trim()}
            onClick={add}
          >
            Add snippet
          </Button>
        </div>
      </div>
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
      <Row
        title="Ask before tool calls"
        description="Claude Code asks you to allow each edit and command. Plan approvals and questions always ask. Codex runs in its workspace-write sandbox either way."
      >
        <Switch
          checked={state.settings.toolApprovals}
          onChange={(toolApprovals) => update({ toolApprovals })}
        />
      </Row>
      <p className="mt-3 mb-0 text-xs text-fg-3">
        Without approvals, agents run with full permissions inside the workspace
        folder. A workspace is a git worktree, not a sandbox.
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
        description="Let Claude Haiku name each workspace, branch and chat tab from its task. When off, the first words of the task are used."
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

const MIN_PORT = 1024;
const MAX_PORT = 65535;

function parsePort(text: string): number | null {
  const port = Number(text);
  const valid = Number.isInteger(port) && port >= MIN_PORT && port <= MAX_PORT;
  return valid ? port : null;
}

function savePort(text: string) {
  const remotePort = parsePort(text);
  if (remotePort === null) {
    toast(`Use a port from ${MIN_PORT} to ${MAX_PORT}`, 'danger');
    return;
  }
  update({ remotePort });
}

function remoteDescription(remote: RemoteStatus): string {
  if (remote.error) return `Remote access did not start: ${remote.error}`;
  if (!remote.address)
    return 'Lets a phone on your Tailscale network use Korev.';
  if (!remote.onTailnet)
    return `Listening on ${remote.address}. Tailscale is not running, so only this Mac can connect. Start Tailscale, then turn remote access off and on.`;
  return `Listening on ${remote.address}.`;
}

function dictationDescription(dictation: DictationStatus): string {
  if (dictation.status === 'ready')
    return 'Downloaded. Speech is turned into text on this Mac, offline.';
  if (dictation.status === 'downloading')
    return `Downloading… ${dictation.progress}%`;
  if (dictation.status === 'failed')
    return `The download did not finish: ${dictation.error}`;
  return 'Speech is turned into text on this Mac. Needs a one-time 550 MB download.';
}

function Voice({
  settings,
  dictation,
}: {
  settings: Settings;
  dictation: DictationStatus;
}) {
  const canDownload =
    dictation.status === 'missing' || dictation.status === 'failed';
  return (
    <>
      <Row
        title="Language"
        description="Detect works for most people. Pick one language if Korev mistakes yours for another."
      >
        <Select
          ariaLabel="Language"
          className="w-40"
          options={DICTATION_LANGUAGES}
          value={settings.dictationLanguage}
          onChange={(language) =>
            update({ dictationLanguage: language as DictationLanguage })
          }
        />
      </Row>
      <Row title="Voice model" description={dictationDescription(dictation)}>
        <Button
          size="sm"
          variant="secondary"
          disabled={!canDownload}
          onClick={() => void api.prepareDictation()}
        >
          Download
        </Button>
      </Row>
    </>
  );
}

async function revokeDevices() {
  await api.revokeRemoteDevices();
  toast('Devices revoked. Pair them again to reconnect.', 'success');
}

function PairingDialog({
  pairing,
  onClose,
}: {
  pairing: RemotePairing | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={pairing !== null}
      onClose={onClose}
      title="Pair a device"
      description="Scan this code with the Korev app. It holds the address and the access token, so do not share it."
    >
      {pairing ? (
        <div className="flex flex-col items-center gap-3">
          <QrCode value={JSON.stringify(pairing)} label="Pairing code" />
          <code className="text-xs break-all text-fg-3">{pairing.url}</code>
        </div>
      ) : null}
    </Dialog>
  );
}

function Remote({
  settings,
  remote,
}: {
  settings: Settings;
  remote: RemoteStatus;
}) {
  const [pairing, setPairing] = useState<RemotePairing | null>(null);
  return (
    <>
      <Row title="Remote access" description={remoteDescription(remote)}>
        <Switch
          checked={settings.remoteAccess}
          onChange={(remoteAccess) => update({ remoteAccess })}
        />
      </Row>
      <Row
        title="Port"
        description="Remote access restarts when you change it."
      >
        <TextSetting
          value={String(settings.remotePort)}
          mono
          onSave={savePort}
        />
      </Row>
      <Row
        title="Pair a device"
        description="Shows a code to scan with the Korev app."
      >
        <Button
          size="sm"
          variant="secondary"
          disabled={!remote.address}
          onClick={async () => setPairing(await api.remotePairing())}
        >
          Show code
        </Button>
      </Row>
      <Row
        title="Connected devices"
        description={remote.devices.length ? remote.devices.join(', ') : 'None'}
      >
        <Button size="sm" variant="secondary" onClick={() => revokeDevices()}>
          Revoke all
        </Button>
      </Row>
      <PairingDialog pairing={pairing} onClose={() => setPairing(null)} />
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
  ['⌘P', 'Quick open file'],
  ['⌘⇧F', 'Search in files'],
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
  ['⌘⇧E', 'Toggle fast mode'],
  ['⌘⇧S', 'Start or stop voice input'],
  ['⌘⇧/', 'Cycle effort level'],
  ['⌃⌘1–5', 'Pick a loadout model'],
  ['⌘;', 'Insert snippet'],
  ['⌘U', 'Add attachment'],
  ['⌘I', 'Create from a branch, PR or issue (new workspace)'],
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

const SCRIPT_TEXTAREA_CLASS =
  'resize-y rounded-sm border border-border-2 bg-inset px-2.5 py-2 font-mono text-xs text-fg-1 outline-none focus:border-accent-border';

const SCRIPT_FIELDS: {
  key: 'setup' | 'archive';
  label: string;
  hint: string;
}[] = [
  {
    key: 'setup',
    label: 'Setup script',
    hint: 'Runs in each new workspace, e.g. npm install.',
  },
  {
    key: 'archive',
    label: 'Archive script',
    hint: 'Runs before a workspace is archived.',
  },
];

const PROMPT_FIELDS: { kind: PromptKind; label: string; hint: string }[] = [
  {
    kind: 'general',
    label: 'General',
    hint: 'Added to every chat in this repository.',
  },
  {
    kind: 'code_review',
    label: 'Code review',
    hint: 'Added when you press Review.',
  },
  {
    kind: 'create_pr',
    label: 'Create pull request',
    hint: 'Added when the agent is asked to open a pull request.',
  },
];

const PICK_SKILL = '';

function reviewSkillPrompt(skill: string): string {
  return `Use the ${skill} skill to review these changes.`;
}

function skillLabel(skill: Skill): string {
  const agents = skill.agents.map((agent) => AGENT_LABELS[agent]).join(' · ');
  return `${skill.name} (${agents})`;
}

function filledPrompts(prompts: RepoPrompts): RepoPrompts {
  return Object.fromEntries(
    Object.entries(prompts).filter(([, text]) => text?.trim()),
  );
}

function ReviewSkillPicker({
  state,
  repo,
  onPick,
}: {
  state: AppState;
  repo: Repo;
  onPick: (skill: string) => void;
}) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [picked, setPicked] = useState<Skill | null>(null);
  useEffect(() => {
    void api.listSkills(repo.id).then(setSkills);
  }, [repo.id]);
  const { reviewModel, defaultAgent } = state.settings;
  const reviewAgent = reviewModel?.agent ?? defaultAgent;
  if (!skills.length) return null;
  return (
    <div className="flex flex-col gap-1">
      <Select
        ariaLabel="Review skill"
        className="w-72"
        options={[
          { value: PICK_SKILL, label: 'Use a skill…' },
          ...skills.map((skill) => ({
            value: skill.name,
            label: skillLabel(skill),
          })),
        ]}
        value={picked?.name ?? PICK_SKILL}
        onChange={(name) => {
          const skill = skills.find((entry) => entry.name === name) ?? null;
          setPicked(skill);
          if (skill) onPick(skill.name);
        }}
      />
      {picked && !picked.agents.includes(reviewAgent) ? (
        <span className="text-xs text-warning-text">
          Reviews run on {AGENT_LABELS[reviewAgent]}, which doesn't have the{' '}
          {picked.name} skill.
        </span>
      ) : null}
    </div>
  );
}

function RepoPromptSettings({ state, repo }: { state: AppState; repo: Repo }) {
  const saved = repo.prompts ?? {};
  const [prompts, setPrompts] = useState<RepoPrompts>(saved);
  useEffect(() => setPrompts(repo.prompts ?? {}), [repo.id, repo.prompts]);
  const dirty =
    JSON.stringify(filledPrompts(prompts)) !==
    JSON.stringify(filledPrompts(saved));
  return (
    <div className="border-b border-border-1 py-4">
      <div className="text-sm font-medium text-fg-1">Prompts</div>
      <p className="mt-0.5 mb-3 text-xs text-fg-3">
        Extra instructions for the agent. A{' '}
        <span className="font-mono">[prompts]</span> entry in the repository's
        settings file replaces the matching one here.
      </p>
      <div className="flex flex-col gap-3">
        {PROMPT_FIELDS.map((field) => (
          <div key={field.kind} className="flex flex-col gap-1">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-fg-2">
                {field.label}
              </span>
              <textarea
                aria-label={`${field.label} prompt`}
                value={prompts[field.kind] ?? ''}
                rows={2}
                placeholder={field.hint}
                className="resize-y rounded-sm border border-border-2 bg-inset px-2.5 py-2 text-xs text-fg-1 outline-none focus:border-accent-border"
                onChange={(event) =>
                  setPrompts({ ...prompts, [field.kind]: event.target.value })
                }
              />
            </label>
            {field.kind === 'code_review' ? (
              <ReviewSkillPicker
                state={state}
                repo={repo}
                onPick={(skill) =>
                  setPrompts({
                    ...prompts,
                    code_review: reviewSkillPrompt(skill),
                  })
                }
              />
            ) : null}
          </div>
        ))}
        <div>
          <Button
            size="sm"
            variant="primary"
            disabled={!dirty}
            onClick={async () => {
              await api.updateRepo(repo.id, {
                prompts: filledPrompts(prompts),
              });
              toast('Prompts saved', 'success');
            }}
          >
            Save prompts
          </Button>
        </div>
      </div>
    </div>
  );
}

function IncludeFilesSettings({ repo }: { repo: Repo }) {
  const saved = repo.fileIncludeGlobs || DEFAULT_INCLUDE_GLOBS;
  const [globs, setGlobs] = useState(saved);
  useEffect(() => setGlobs(saved), [repo.id, saved]);
  return (
    <div className="border-b border-border-1 py-4">
      <div className="text-sm font-medium text-fg-1">Files to copy</div>
      <p className="mt-0.5 mb-3 text-xs text-fg-3">
        Gitignored files to copy from the repository folder into each new
        workspace. One per line: a file name like{' '}
        <span className="font-mono">config/secrets.json</span> or a pattern like{' '}
        <span className="font-mono">.env*</span>, in .gitignore syntax. A{' '}
        <span className="font-mono">.worktreeinclude</span> file, or{' '}
        <span className="font-mono">file_include_globs</span> in the
        repository's settings file, replaces this list.
      </p>
      <div className="flex flex-col gap-3">
        <textarea
          aria-label="Files to copy"
          value={globs}
          rows={3}
          className={SCRIPT_TEXTAREA_CLASS}
          onChange={(event) => setGlobs(event.target.value)}
        />
        <div>
          <Button
            size="sm"
            variant="primary"
            disabled={globs === saved}
            onClick={async () => {
              await api.updateRepo(repo.id, { fileIncludeGlobs: globs });
              toast('Files to copy saved', 'success');
            }}
          >
            Save files
          </Button>
        </div>
      </div>
    </div>
  );
}

const SOURCE_NOTICE: Record<RepoConfigSource, string | null> = {
  app: null,
  'korev.json':
    'This repository has a korev.json. Its scripts replace the ones below.',
  'settings.toml':
    'This repository has .korev/settings.toml. Its scripts, run scripts, preview URLs, prompts and git options replace the ones below.',
  conductor:
    "This repository has Conductor's .conductor/settings.toml and no .korev/settings.toml. Its scripts, run scripts, preview URLs, prompts and git options replace the ones below.",
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

function runScriptsProblem(scripts: AppRunScript[]): string | null {
  const names = scripts.map((script) => script.name.trim());
  if (scripts.some((script, index) => script.command.trim() && !names[index]))
    return 'Give every run script a name.';
  if (new Set(names).size !== names.length)
    return 'Run script names must be different.';
  return null;
}

function RunScriptsEditor({
  scripts,
  onChange,
}: {
  scripts: AppRunScript[];
  onChange: (scripts: AppRunScript[]) => void;
}) {
  const change = (index: number, edit: Partial<AppRunScript>) =>
    onChange(
      scripts.map((script, position) =>
        position === index ? { ...script, ...edit } : script,
      ),
    );
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-fg-2">Run scripts</span>
      <span className="text-xs text-fg-3">
        The first one runs on ⌘R. Pick another from the Run tab.
      </span>
      {scripts.map((script, index) => (
        <div key={index} className="flex items-start gap-2">
          <Input
            aria-label="Run script name"
            className="w-36"
            mono
            value={script.name}
            placeholder="frontend"
            onChange={(event) => change(index, { name: event.target.value })}
          />
          <textarea
            aria-label="Run script command"
            value={script.command}
            rows={1}
            placeholder="npm run dev -- --port $KOREV_PORT"
            className={cn(SCRIPT_TEXTAREA_CLASS, 'flex-1')}
            onChange={(event) => change(index, { command: event.target.value })}
          />
          <IconButton
            icon="trash-2"
            label="Remove run script"
            onClick={() =>
              onChange(scripts.filter((_, position) => position !== index))
            }
          />
        </div>
      ))}
      <div>
        <Button
          size="sm"
          variant="secondary"
          icon="plus"
          onClick={() => onChange([...scripts, { name: '', command: '' }])}
        >
          Add run script
        </Button>
      </div>
    </div>
  );
}

function RepoSettings({ state, repo }: { state: AppState; repo: Repo }) {
  const [scripts, setScripts] = useState<RepoScripts>(repo.scripts);
  const [confirmRemove, setConfirmRemove] = useState(false);
  useEffect(() => setScripts(repo.scripts), [repo.id, repo.scripts]);
  const dirty = JSON.stringify(scripts) !== JSON.stringify(repo.scripts);
  const problem = runScriptsProblem(scripts.run);
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
        title="Use spotlight testing"
        description="Shows a Spotlight button in each workspace's Run tab. It mirrors that workspace's tracked changes into this repository's own checkout, for apps you can only run from there."
      >
        <Switch
          checked={repo.spotlightTesting ?? false}
          onChange={(spotlightTesting) =>
            void api.updateRepo(repo.id, { spotlightTesting })
          }
        />
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
      <IncludeFilesSettings repo={repo} />
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
                className={SCRIPT_TEXTAREA_CLASS}
                onChange={(event) =>
                  setScripts({ ...scripts, [field.key]: event.target.value })
                }
              />
            </label>
          ))}
          <RunScriptsEditor
            scripts={scripts.run}
            onChange={(run) => setScripts({ ...scripts, run })}
          />
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
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="primary"
              disabled={!dirty || problem !== null}
              onClick={async () => {
                await api.updateRepoScripts(repo.id, {
                  ...scripts,
                  run: scripts.run.map((script) => ({
                    ...script,
                    name: script.name.trim(),
                  })),
                });
                toast('Scripts saved', 'success');
              }}
            >
              Save scripts
            </Button>
            {problem ? (
              <span className="text-xs text-danger-text">{problem}</span>
            ) : null}
          </div>
        </div>
      </div>
      <RepoPromptSettings state={state} repo={repo} />
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
  else if (current?.id === 'remote')
    body = <Remote settings={state.settings} remote={state.remote} />;
  else if (current?.id === 'voice')
    body = <Voice settings={state.settings} dictation={state.dictation} />;
  else if (current?.id === 'shortcuts') body = <Shortcuts />;
  else if (current?.id === 'snippets')
    body = <Snippets settings={state.settings} />;

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
