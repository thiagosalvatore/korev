import {
  Activity,
  AudioLines,
  BellDot,
  CalendarClock,
  FileCog,
  GitPullRequest,
  History,
  KeyRound,
  LayoutGrid,
  ListChecks,
  ListOrdered,
  Network,
  Plug,
  ScanEye,
  TextSearch,
  SquareTerminal,
  type LucideIcon,
} from 'lucide-react';

const FEATURES: [LucideIcon, string, string][] = [
  [
    History,
    'Checkpoints',
    'Korev saves the worktree before every message you send. Revert to a message and the files go back with it.',
  ],
  [
    ListChecks,
    'Plan mode',
    'Press ⇧Tab. The agent reads and plans without changing files. Approve the plan to let it build.',
  ],
  [
    ListOrdered,
    'Message queue',
    'A message you send while the agent works waits above the message box until the agent finishes. Click its arrow to steer the agent with it now.',
  ],
  [
    Plug,
    'Ten ports per workspace',
    'Each workspace gets its own $KOREV_PORT range, so two dev servers never fight for a port.',
  ],
  [
    FileCog,
    'Repository config',
    '.korev/settings.toml sets setup, run and archive scripts, preview URLs, env files and prompts.',
  ],
  [
    GitPullRequest,
    'Start from a PR or issue',
    'Create a workspace from an existing branch, pull request or GitHub issue.',
  ],
  [
    CalendarClock,
    'Automations',
    'Run a prompt on a schedule, such as a check of your support tickets every 10 minutes on weekdays, and open a workspace for each new piece of work it finds.',
  ],
  [
    AudioLines,
    'Hands-free mode',
    'Say "Korev, create a workspace to plan the login page" and it happens. Korev reads out questions and plans, and you answer by voice.',
  ],
  [
    ScanEye,
    'Spotlight testing',
    'For apps that only run from the main checkout, Korev syncs a workspace’s changes into it.',
  ],
  [
    BellDot,
    'Waiting for you',
    'When an agent asks you something, or a pull request has failing checks, conflicts or unanswered comments, its workspace shows at the top of the sidebar.',
  ],
  [
    Network,
    'Runs',
    'One agent splits a task and starts a worker agent for each part, each in its own workspace. Resume a run that paused or was interrupted.',
  ],
  [
    LayoutGrid,
    'Grid and board',
    'Watch chats and terminals from different workspaces side by side, or see every workspace on one board, sorted by what its agent does.',
  ],
  [
    Activity,
    'Runs after you quit',
    'Quit Korev and your agents and automations keep going. Korev waits in the menu bar until you open it again.',
  ],
  [
    SquareTerminal,
    'korev in your terminal',
    'Run korev new --task "..." in your own shell to start a workspace, or list, message and stop your chats.',
  ],
  [
    KeyRound,
    'Signed commits',
    'Agents sign their commits with a key in the Secure Enclave, even while your Mac is locked.',
  ],
  [
    TextSearch,
    'Find in terminals',
    'Press ⌘F in any terminal to search its output and step through each match.',
  ],
];

export function Also() {
  return (
    <div className="lp-also">
      {FEATURES.map(([Icon, title, body]) => (
        <div key={title}>
          <h4>
            <Icon size={16} />
            {title}
          </h4>
          <p>{body}</p>
        </div>
      ))}
    </div>
  );
}
