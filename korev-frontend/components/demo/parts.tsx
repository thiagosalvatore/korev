import type { CSSProperties, ReactNode } from 'react';
import {
  ArrowRight,
  ArrowUp,
  Brain,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleX,
  FileCode2,
  FileDiff,
  FilePlus,
  FileText,
  FolderGit2,
  GitBranch,
  GitMerge,
  GitPullRequest,
  History,
  Link,
  LoaderCircle,
  MessageCircleQuestion,
  PanelRightClose,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Settings,
  Sparkle,
  SquarePen,
  SquareTerminal,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { Button, type ButtonVariant } from '@/components/ds/Button';

export const MERGED_PURPLE = '#9D7BF0';

export type WorkspaceState =
  | 'run'
  | 'open'
  | 'fail'
  | 'checks'
  | 'merged'
  | 'branch';

export interface Workspace {
  id: string;
  branch: string;
  name: string;
  state: WorkspaceState;
  add: number | null;
  del: number | null;
  unread?: boolean;
  fresh?: boolean;
  linked?: boolean;
}

export interface Repo {
  name: string;
  workspaces: Workspace[];
}

type ToolName = 'Read' | 'Grep' | 'Edit' | 'Bash' | 'Write';

export type ChatItem = { at: number } & (
  | { kind: 'user'; text: ReactNode; system?: boolean }
  | { kind: 'tool'; tool: ToolName; target: string; add?: number; del?: number }
  | { kind: 'agent'; body: ReactNode }
  | { kind: 'changes'; files: number; add: number; del: number }
  | { kind: 'custom'; body: ReactNode }
);

export interface HeaderAction {
  label: string;
  variant: ButtonVariant;
  icon?: LucideIcon;
  loading?: boolean;
  pressed?: boolean;
}

export type FileStat = [path: string, add: number, del: number];
type CheckState = 'run' | 'ok' | 'fail';
export type Check = [name: string, state: CheckState, duration: string];
type TermLine = [className: string, text: string];

export interface PanelProps {
  tab?: 'all' | 'changes' | 'checks';
  files?: FileStat[];
  checks?: Check[];
  pr?: { n: number; state: WorkspaceState; title: string };
  terminalTab?: 'setup' | 'run' | 'terminal';
  terminal?: TermLine[] | null;
}

const STATE_ICON: Record<
  Exclude<WorkspaceState, 'run'>,
  [LucideIcon, string]
> = {
  open: [GitPullRequest, 'var(--success)'],
  fail: [GitPullRequest, 'var(--danger)'],
  checks: [GitPullRequest, 'var(--warning)'],
  merged: [GitMerge, MERGED_PURPLE],
  branch: [GitBranch, 'var(--fg-4)'],
};

const TOOL_ICON: Record<ToolName, LucideIcon> = {
  Read: FileText,
  Grep: Search,
  Edit: Pencil,
  Bash: SquareTerminal,
  Write: FilePlus,
};

const SETUP_TERMINAL: TermLine[] = [
  ['c', '$ npm ci'],
  ['', 'added 1,284 packages in 9s'],
  ['ok', 'Setup finished · 11s'],
];

export const KRL_FILES: FileStat[] = [
  ['src/middleware/rateLimit.ts', 18, 4],
  ['src/middleware/rateLimit.test.ts', 22, 8],
  ['docs/api/rate-limits.md', 44, 0],
];

export function Press({
  on,
  children,
  style,
}: {
  on: boolean;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <span className={`km-press${on ? ' on' : ''}`} style={style}>
      {children}
    </span>
  );
}

export function Spinner({
  size = 14,
  color = 'var(--warning)',
}: {
  size?: number;
  color?: string;
}) {
  return (
    <span className="km-spin" style={{ color }}>
      <LoaderCircle size={size} />
    </span>
  );
}

export function StateIcon({ state }: { state: WorkspaceState }) {
  if (state === 'run') return <Spinner />;
  const [Icon, color] = STATE_ICON[state];
  return <Icon size={14} color={color} />;
}

export function DiffStat({ add, del }: { add: number; del: number }) {
  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      <span style={{ color: 'var(--diff-add-fg)' }}>+{add}</span>{' '}
      <span style={{ color: 'var(--diff-del-fg)' }}>−{del}</span>
    </span>
  );
}

export function WorkspaceRow({
  workspace: w,
  selected,
}: {
  workspace: Workspace;
  selected: boolean;
}) {
  const showUnread = w.unread && !selected;
  const className = [
    'km-row',
    selected && 'sel',
    showUnread && 'unread',
    w.fresh && 'fresh',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={className}>
      <span className="ic">
        <StateIcon state={w.state} />
      </span>
      <span className="b">{w.branch}</span>
      <span className="r">
        {w.add != null && w.del != null && <DiffStat add={w.add} del={w.del} />}
        {showUnread && <span className="km-dot" />}
      </span>
      <span className="n">
        {w.linked && <Link size={11} />}
        {w.name}
      </span>
    </div>
  );
}

export function RepoHeading({ name }: { name: string }) {
  return (
    <div className="km-sec">
      <FolderGit2 size={12} />
      {name}
    </div>
  );
}

export function Sidebar({
  repos,
  selected,
  askSelected,
  askChats = [],
}: {
  repos: Repo[];
  selected: string | null;
  askSelected?: boolean;
  askChats?: { title: string; ago: string }[];
}) {
  return (
    <aside className="km-side">
      <div className="km-traffic">
        <i />
        <i />
        <i />
      </div>
      <div className="km-nav">
        <Search size={14} />
        Search<span className="k">⌘K</span>
      </div>
      <div className="km-nav">
        <SquarePen size={14} />
        New workspace<span className="k">⌘N</span>
      </div>
      <div className={`km-nav${askSelected && !askChats.length ? ' sel' : ''}`}>
        <MessageCircleQuestion size={14} />
        Ask
      </div>
      {askChats.map((chat) => (
        <div key={chat.title} className={`km-sub${askSelected ? ' sel' : ''}`}>
          {chat.title}
          <span className="ago">{chat.ago}</span>
        </div>
      ))}
      {repos.map((repo) => (
        <div key={repo.name}>
          <RepoHeading name={repo.name} />
          {repo.workspaces.map((w) => (
            <WorkspaceRow
              key={w.id}
              workspace={w}
              selected={w.id === selected}
            />
          ))}
        </div>
      ))}
      <div style={{ flex: 1 }} />
      <div className="km-nav">
        <History size={14} />
        History
      </div>
      <div className="km-nav">
        <Settings size={14} />
        Settings
      </div>
    </aside>
  );
}

export function WorkspaceHeader({
  name,
  branch,
  pr,
  action,
}: {
  name: string;
  branch: string;
  pr?: number | null;
  action: HeaderAction;
}) {
  return (
    <header className="km-head">
      <span className="nm">{name}</span>
      <ChevronRight size={13} color="var(--fg-4)" />
      <span className="br">
        <GitBranch size={13} color="var(--fg-3)" />
        {branch}
      </span>
      <span className="tg">
        <ArrowRight size={12} />
        origin/main
      </span>
      <span className="sp" />
      <span className="acts">
        {pr && (
          <span className="km-ghost">
            <GitPullRequest size={13} />#{pr}
          </span>
        )}
        <Press on={!!action.pressed}>
          <Button
            size="sm"
            variant={action.variant}
            icon={action.icon}
            loading={action.loading}
            tabIndex={-1}
          >
            {action.label}
          </Button>
        </Press>
        <span className="km-ghost" style={{ padding: '0 5px' }}>
          <PanelRightClose size={14} />
        </span>
      </span>
    </header>
  );
}

export type TabId = 'chat' | 'changes';

const WORKSPACE_TABS: [TabId, LucideIcon, string][] = [
  ['chat', Sparkle, 'Claude Code'],
  ['changes', FileDiff, 'Changes'],
];

export function Tabs({ active }: { active: TabId }) {
  return (
    <div className="km-tabs">
      {WORKSPACE_TABS.map(([id, Icon, label]) => (
        <div key={id} className={`km-tab${id === active ? ' on' : ''}`}>
          <Icon size={13} />
          {label}
        </div>
      ))}
      <div className="km-tab">
        <Plus size={13} />
      </div>
    </div>
  );
}

function ChatEntry({ item }: { item: ChatItem }) {
  switch (item.kind) {
    case 'user':
      return (
        <div className={`km-user${item.system ? ' sys' : ''}`}>{item.text}</div>
      );
    case 'tool': {
      const Icon = TOOL_ICON[item.tool];
      return (
        <div className="km-tool">
          <Icon size={13} />
          <b>{item.tool}</b>
          <code>{item.target}</code>
          {item.add != null && item.del != null && (
            <span style={{ font: '11px var(--font-mono)' }}>
              <DiffStat add={item.add} del={item.del} />
            </span>
          )}
        </div>
      );
    }
    case 'agent':
      return <div className="km-agent">{item.body}</div>;
    case 'changes':
      return (
        <div className="km-chg">
          <FileDiff size={13} />
          {item.files} files changed
          <DiffStat add={item.add} del={item.del} />
        </div>
      );
    case 'custom':
      return <div>{item.body}</div>;
  }
}

export function Chat({
  items,
  t,
  running,
  status = 'Working',
}: {
  items: ChatItem[];
  t: number;
  running: boolean;
  status?: string;
}) {
  return (
    <div className="km-chat">
      {items
        .filter((item) => item.at <= t)
        .map((item, n) => (
          <ChatEntry key={n} item={item} />
        ))}
      {running && (
        <div className="km-status">
          <Spinner size={13} />
          {status}
        </div>
      )}
    </div>
  );
}

const CONTEXT_USED = '34%';

export function ComposerBar({ children }: { children: ReactNode }) {
  return <div className="km-bar">{children}</div>;
}

export function ModelChips({ withMenu }: { withMenu?: boolean }) {
  return (
    <>
      <span className="km-chip m">
        <Sparkle size={13} />
        Opus 5.5
        {withMenu && <ChevronDown size={12} color="var(--fg-4)" />}
      </span>
      <span className="km-chip">
        <Brain size={13} />
        high
      </span>
    </>
  );
}

export function SendButton({ off }: { off?: boolean }) {
  return (
    <span className={`km-send${off ? ' off' : ''}`}>
      <ArrowUp size={14} />
    </span>
  );
}

export function Composer({
  placeholder = 'Message Claude Code',
  running,
}: {
  placeholder?: string;
  running?: boolean;
}) {
  return (
    <div className="km-comp">
      <div className="txt">{placeholder}</div>
      <ComposerBar>
        <span className="km-chip">
          <Plus size={14} />
        </span>
        <span className="km-chip">
          <Paperclip size={13} />
        </span>
        <ModelChips withMenu />
        <span className="km-chip">
          <Zap size={13} />
        </span>
        <span className="km-ml" />
        {running && <span className="km-hint">Steers the running agent</span>}
        <span
          className="km-ring"
          style={{ '--p': CONTEXT_USED } as CSSProperties}
        />
        <SendButton off />
      </ComposerBar>
    </div>
  );
}

const PANEL_TABS = [
  ['all', 'All files'],
  ['changes', 'Changes'],
  ['checks', 'Checks'],
] as const;
const TERMINAL_TABS = [
  ['setup', 'Setup'],
  ['run', 'Run'],
  ['terminal', 'Terminal'],
] as const;

function CheckIcon({ state }: { state: CheckState }) {
  if (state === 'run') return <Spinner size={13} />;
  if (state === 'ok') return <CircleCheck size={14} color="var(--success)" />;
  return <CircleX size={14} color="var(--danger)" />;
}

function ChecksList({
  checks,
  pr,
}: {
  checks: Check[];
  pr?: PanelProps['pr'];
}) {
  return (
    <>
      {pr && (
        <div className="km-prline">
          <StateIcon state={pr.state} />
          <span>
            #{pr.n} {pr.title}
          </span>
        </div>
      )}
      {checks.map(([name, state, duration]) => (
        <div key={name} className="km-check">
          <CheckIcon state={state} />
          {name}
          <span className="d">{duration}</span>
        </div>
      ))}
    </>
  );
}

function FileList({ files }: { files: FileStat[] }) {
  return files.map(([path, add, del]) => (
    <div key={path} className="km-file">
      <FileCode2 size={13} />
      <span className="p">{path}</span>
      <span className="s">
        <DiffStat add={add} del={del} />
      </span>
    </div>
  ));
}

export function Panel({
  tab = 'changes',
  files = KRL_FILES,
  checks,
  pr,
  terminalTab = 'setup',
  terminal,
}: PanelProps) {
  return (
    <aside className="km-panel">
      <div className="km-ptabs">
        {PANEL_TABS.map(([id, label]) => (
          <div key={id} className={`km-tab${id === tab ? ' on' : ''}`}>
            {label}
            {id === 'changes' && files.length > 0 && (
              <span
                style={{ font: '11px var(--font-mono)', color: 'var(--fg-4)' }}
              >
                {files.length}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="km-git">
        {tab === 'checks' && checks ? (
          <ChecksList checks={checks} pr={pr} />
        ) : (
          <FileList files={files} />
        )}
      </div>
      <div className="km-ptabs lo">
        {TERMINAL_TABS.map(([id, label]) => (
          <div key={id} className={`km-tab${id === terminalTab ? ' on' : ''}`}>
            {label}
          </div>
        ))}
      </div>
      <div className="km-term">
        {(terminal ?? SETUP_TERMINAL).map(([className, line], i) => (
          <div key={i} className={className}>
            {line}
          </div>
        ))}
      </div>
    </aside>
  );
}
