import {
  Archive,
  FileCog,
  GitPullRequest,
  History,
  ListChecks,
  Plug,
  ScanEye,
  Smartphone,
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
    Smartphone,
    'From your phone',
    'Check on running agents and send messages from the phone app, over Tailscale.',
  ],
  [
    ScanEye,
    'Spotlight testing',
    'For apps that only run from the main checkout, Korev syncs a workspace’s changes into it.',
  ],
  [
    Archive,
    'Archive on merge',
    'When the PR merges, Korev stops the agents, snapshots the files and removes the worktree.',
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
