import type { ReactNode } from 'react';
import {
  FileDiff,
  GitBranch,
  GitPullRequestArrow,
  Link,
  type LucideIcon,
} from 'lucide-react';
import { KorevDemo } from '@/components/demo/KorevDemo';
import { Also } from '@/components/landing/Also';
import { Download, Footer, Nav } from '@/components/landing/Chrome';
import {
  Branch,
  Linked,
  MainCommit,
  Review,
  Ship,
  Worktrees,
} from '@/components/landing/Graph';
import { Install } from '@/components/landing/Install';

function BranchSection({
  name,
  icon: Icon,
  shortcut,
  title,
  body,
  points,
  card,
}: {
  name: string;
  icon: LucideIcon;
  shortcut: string;
  title: string;
  body: ReactNode;
  points: ReactNode[];
  card: ReactNode;
}) {
  return (
    <Branch name={name}>
      <div className="b-row">
        <div className="b-txt">
          <span className="brn">
            <Icon size={13} />
            {shortcut}
          </span>
          <h2>{title}</h2>
          <p>{body}</p>
          <ul>
            {points.map((point, i) => (
              <li key={i}>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
        {card}
      </div>
    </Branch>
  );
}

function Hero() {
  return (
    <header className="b-hero">
      <div>
        <div className="cmd">
          <GitBranch size={14} />
          <b>main</b> · 4 workspaces running
        </div>
        <h1>Every task on its own branch.</h1>
      </div>
      <div>
        <p>
          Korev runs Claude Code and Codex in parallel on your Mac. Each task
          gets a git worktree with its own chats, terminal, diff and pull
          request.
        </p>
        <Download />
      </div>
    </header>
  );
}

function FeatureGraph() {
  return (
    <div className="b-graph">
      <MainCommit sha="5c11f32" message="main" />
      <BranchSection
        name="Worktrees"
        icon={GitBranch}
        shortcut="⌘N · new workspace"
        title="Start the next task while the first one runs."
        body="A workspace is a git worktree on its own branch. Agents in two workspaces never edit the same files."
        points={[
          <>
            Korev copies your <code>.env</code> files and runs your setup script
          </>,
          <>
            Each workspace gets ten ports, starting at <code>$KOREV_PORT</code>
          </>,
          'Switch with ⌘1 to ⌘9; bold rows have unread output',
        ]}
        card={<Worktrees />}
      />
      <MainCommit sha="a41e0c9" message="Merge #479 Dark mode settings" />
      <BranchSection
        name="Review"
        icon={FileDiff}
        shortcut="⌘⇧D · diff view"
        title="Read the diff. Comment on lines. Send them all at once."
        body="The Changes tab lists every file that differs from the target branch. Comments collect until you send them to the agent as one message."
        points={[
          'Unified or split, with Viewed to collapse a file',
          '“N files changed” after each turn shows only that turn',
          'Open a review chat with its own model',
        ]}
        card={<Review />}
      />
      <MainCommit sha="e7d2b18" message="Merge #481 Fix flaky checkout test" />
      <BranchSection
        name="Ship"
        icon={GitPullRequestArrow}
        shortcut="⌘⇧P · ⌘⇧X · ⌘⇧M"
        title="One button walks it to merge."
        body={
          <>
            The header always shows the next git step. Create PR and Fix errors
            send a prompt to the agent. Merge runs{' '}
            <code>gh pr merge --squash</code>.
          </>
        }
        points={[
          'Failing checks go to the agent with their links',
          'GitHub review comments come in with Add to chat',
          'Archive on merge cleans up the worktree',
        ]}
        card={<Ship />}
      />
      <MainCommit
        sha="0b93fa4"
        message="Merge #482 Send rate limit headers on every response"
      />
      <BranchSection
        name="Ask"
        icon={Link}
        shortcut="Ask · linked workspaces"
        title="Plan across repositories before anything changes."
        body="Ask reads the default branch and cannot edit files. When the plan is ready, Start workspaces opens one linked workspace per repository with the whole conversation."
        points={[
          'Each agent changes only its own repository',
          <>
            It can read the linked ones and leave notes in{' '}
            <code>.context/</code>
          </>,
        ]}
        card={<Linked />}
      />
      <MainCommit
        sha="c2f8e61"
        message="Merge #483 Billing portal"
        extra={<span className="h">· acme/web, acme/api</span>}
      />
    </div>
  );
}

export default function Home() {
  return (
    <div className="lp">
      <Nav />
      <div className="lp-wrap">
        <Hero />
        <div className="b-demo">
          <KorevDemo />
        </div>
        <FeatureGraph />
      </div>
      <section className="b-sec">
        <div className="lp-wrap">
          <h3>Also in Korev</h3>
          <Also />
        </div>
      </section>
      <section className="b-sec">
        <div className="lp-wrap b-end">
          <div>
            <h3>Uses the agents you already have.</h3>
            <p>
              Korev runs the <code>claude</code> and <code>codex</code> CLIs
              with their own sign-in, MCP servers and skills, and uses{' '}
              <code>gh</code> for pull requests and checks.
            </p>
            <Download withNote={false} />
          </div>
          <Install />
        </div>
      </section>
      <Footer />
    </div>
  );
}
