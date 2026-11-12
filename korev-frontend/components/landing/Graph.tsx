'use client';

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Archive,
  BatteryFull,
  BookOpenText,
  Check,
  CircleHelp,
  ChevronRight,
  Eye,
  Layers,
  FileCode2,
  FolderTree,
  GitBranchPlus,
  GitMerge,
  GitPullRequestArrow,
  Inbox as InboxIcon,
  MessageCircleQuestion,
  Send,
  Signal,
  Sparkles,
  Wifi,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { Button, type ButtonVariant } from '@/components/ds/Button';
import { DiffHunk } from '@/components/ds/DiffHunk';
import { LogoMark } from '@/components/ds/Logo';
import {
  DiffStat,
  RepoHeading,
  StateIcon,
  WorkspaceRow,
  type WorkspaceState,
} from '@/components/demo/parts';
import {
  ASK_QUESTION,
  COMMENTED_DIFF_LINE,
  RATE_LIMIT_DIFF,
  REVIEW_COMMENT,
  ReviewComment,
  SAVED_COMMENT_AUTHOR,
  billingPortal,
} from '@/components/demo/scenes';
import { useTick } from './useTick';

const VISIBLE_THRESHOLD = 0.2;

export function Branch({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setVisible(true);
        observer.disconnect();
      },
      { threshold: VISIBLE_THRESHOLD },
    );
    observer.observe(ref.current!);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      className={`b-br${visible ? ' in' : ''}`}
      aria-label={name}
    >
      <svg className="f" viewBox="0 0 80 64" aria-hidden="true">
        <path pathLength="100" d="M21 0 C21 34 61 30 61 64" />
      </svg>
      <span className="ln" />
      <span className="cd" />
      <svg className="m" viewBox="0 0 80 64" aria-hidden="true">
        <path pathLength="100" d="M61 0 C61 34 21 30 21 64" />
      </svg>
      {children}
    </section>
  );
}

export function MainCommit({
  sha,
  message,
  extra,
}: {
  sha: string;
  message: string;
  extra?: ReactNode;
}) {
  return (
    <div className="b-main">
      <span className="h">{sha}</span>
      <b>{message}</b>
      {extra}
    </div>
  );
}

export function Worktrees() {
  const tick = useTick(1800, 4);
  const rows: [name: string, port: number, state: WorkspaceState][] = [
    ['rate-limit-headers', 55000, 'run'],
    ['fix-flaky-checkout', 55010, tick >= 1 ? 'checks' : 'run'],
    ['dark-mode-settings', 55020, 'open'],
    ['onboarding-copy', 55030, tick >= 3 ? 'branch' : 'run'],
  ];
  return (
    <div className="b-card">
      <div className="hd">
        <FolderTree size={13} />
        ~/korev/workspaces/web/
        <span className="r">4 worktrees · one .git</span>
      </div>
      {rows.map(([name, port, state]) => (
        <div key={name} className="b-wt">
          <StateIcon state={state} />
          <span>{name}/</span>
          <span className="br">thiago/{name}</span>
          <span className="p">:{port}</span>
        </div>
      ))}
    </div>
  );
}

const REVIEW_CARD_LINES = 12;

export function Review() {
  return (
    <div className="b-card">
      <div className="hd">
        <FileCode2 size={13} />
        src/middleware/rateLimit.ts
        <span className="r">
          <Button size="sm" variant="primary" icon={Send} tabIndex={-1}>
            1 comment ready to send
          </Button>
        </span>
      </div>
      <div style={{ padding: 12 }}>
        <DiffHunk
          oldStart={18}
          newStart={18}
          lines={RATE_LIMIT_DIFF.slice(0, REVIEW_CARD_LINES)}
          notes={{
            [COMMENTED_DIFF_LINE]: (
              <ReviewComment author={SAVED_COMMENT_AUTHOR}>
                {REVIEW_COMMENT}
              </ReviewComment>
            ),
          }}
        />
      </div>
    </div>
  );
}

interface ShipStep {
  label: string;
  variant: ButtonVariant;
  prState: WorkspaceState;
  icon?: LucideIcon;
  loading?: boolean;
}

const SHIP_STEPS: ShipStep[] = [
  {
    label: 'Create PR',
    icon: GitPullRequestArrow,
    variant: 'primary',
    prState: 'branch',
  },
  {
    label: 'Checks running',
    variant: 'secondary',
    loading: true,
    prState: 'checks',
  },
  { label: 'Fix errors', icon: Wrench, variant: 'danger', prState: 'fail' },
  {
    label: 'Checks running',
    variant: 'secondary',
    loading: true,
    prState: 'checks',
  },
  { label: 'Merge', icon: GitMerge, variant: 'success', prState: 'open' },
  { label: 'Archive', icon: Archive, variant: 'secondary', prState: 'merged' },
];

const MILESTONES: [label: string, steps: number[]][] = [
  ['Create PR', [0, 1]],
  ['Fix errors', [2, 3]],
  ['Merge', [4]],
  ['Archive', [5]],
];

function milestoneClass(steps: number[], current: number) {
  if (steps.includes(current)) return 's on';
  if (current > steps[0]) return 's done';
  return 's';
}

export function Ship() {
  const current = useTick(1700, SHIP_STEPS.length);
  const step = SHIP_STEPS[current];
  return (
    <div className="b-card b-ship">
      <div className="b-hdr">
        <StateIcon state={step.prState} />
        <span className="nm">Rate limit headers</span>
        <span className="bn">thiago/rate-limit-headers</span>
        <span style={{ flex: 1 }} />
        {current > 0 && <span className="pr">#482</span>}
        <Button
          size="sm"
          variant={step.variant}
          icon={step.icon}
          loading={step.loading}
          tabIndex={-1}
        >
          {step.label}
        </Button>
      </div>
      <div className="b-steps">
        {MILESTONES.map(([label, steps], k) => (
          <Fragment key={label}>
            <span className={milestoneClass(steps, current)}>{label}</span>
            {k < MILESTONES.length - 1 && <ChevronRight size={12} />}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

type InboxTone = 'success' | 'warning' | 'danger';

interface InboxRow {
  number: number;
  title: string;
  details: string;
  status: string;
  tone: InboxTone;
  stackSize?: number;
  stacked?: boolean;
}

const INBOX_VIEWS: [label: string, rows: InboxRow[]][] = [
  [
    'Needs review',
    [
      {
        number: 486,
        title: 'Cache the billing portal session',
        details: 'acme/web#486 · @maria',
        status: 'Ready',
        tone: 'success',
      },
      {
        number: 487,
        title: 'Queue webhook deliveries',
        details: 'acme/api#487 · @sam',
        status: 'Checks running',
        tone: 'warning',
        stackSize: 2,
      },
      {
        number: 488,
        title: 'Retry failed webhooks with backoff',
        details: 'acme/api#488 · @sam',
        status: 'Changes requested',
        tone: 'warning',
        stacked: true,
      },
    ],
  ],
  [
    'Mine',
    [
      {
        number: 489,
        title: 'Dark mode settings',
        details: 'acme/web#489 · @thiago',
        status: 'Ready',
        tone: 'success',
      },
      {
        number: 490,
        title: 'Onboarding copy',
        details: 'acme/web#490 · @thiago',
        status: 'Checks failing',
        tone: 'danger',
      },
    ],
  ],
];

function InboxPullRequest({ row }: { row: InboxRow }) {
  return (
    <div className={`b-pr${row.stacked ? ' stacked' : ''}`}>
      <div className="t">
        <b>{row.title}</b>
        <span>
          {row.stackSize && (
            <span className="b-stack">
              <Layers size={11} />
              Stack of {row.stackSize}
            </span>
          )}
          {row.details}
        </span>
      </div>
      <span className={`b-badge ${row.tone}`}>{row.status}</span>
      <span className="a">
        <Button size="sm" variant="ghost" icon={Sparkles} tabIndex={-1}>
          Review
        </Button>
        <Button size="sm" variant="ghost" icon={BookOpenText} tabIndex={-1}>
          Explain
        </Button>
      </span>
    </div>
  );
}

export function Inbox() {
  const current = useTick(3200, INBOX_VIEWS.length);
  const rows = INBOX_VIEWS[current][1];
  return (
    <div className="b-card">
      <div className="hd">
        <InboxIcon size={13} />
        Pull requests
        <span className="r b-steps">
          {INBOX_VIEWS.map(([label, viewRows], index) => (
            <span key={label} className={index === current ? 's on' : 's'}>
              {label} {viewRows.length}
            </span>
          ))}
        </span>
      </div>
      <div className="b-pr th">
        <span>Pull request</span>
        <span>Status</span>
        <span className="a" />
      </div>
      {rows.map((row) => (
        <InboxPullRequest key={row.number} row={row} />
      ))}
    </div>
  );
}

interface ExplainStep {
  title: string;
  lines: [start: number, end: number];
  newStart: number;
}

const EXPLAIN_STEPS: ExplainStep[] = [
  { title: 'Read what the limiter already knows', lines: [2, 5], newStart: 19 },
  {
    title: 'Send the limits back on every response',
    lines: [5, 8],
    newStart: 20,
  },
  { title: 'Say why a request was refused', lines: [8, 11], newStart: 23 },
];

export function Explain() {
  const current = useTick(2600, EXPLAIN_STEPS.length);
  const [start, end] = EXPLAIN_STEPS[current].lines;
  const newStart = EXPLAIN_STEPS[current].newStart;
  return (
    <div className="b-card">
      <div className="hd">
        <BookOpenText size={13} />
        #482 Rate limit headers
        <span className="r b-stack">
          <Layers size={12} />
          Stack of 2 · #481 → #482
        </span>
      </div>
      <div className="b-explain">
        <span className="ov">In one sentence</span>
        <p className="hl">
          API clients now see how many requests they have left, and why a
          request was refused.
        </p>
        <ol className="b-tour">
          {EXPLAIN_STEPS.map((step, index) => (
            <li
              key={step.title}
              className={
                index === current ? 'on' : index < current ? 'done' : undefined
              }
            >
              <span className="n">
                {index < current ? <Check size={11} /> : index + 1}
              </span>
              {step.title}
            </li>
          ))}
        </ol>
        <DiffHunk
          oldStart={newStart}
          newStart={newStart}
          lines={RATE_LIMIT_DIFF.slice(start, end)}
        />
        <div className="b-risk">
          <Eye size={13} />
          <b>Medium</b>
          Every caller can now read the limit, anonymous ones too.
        </div>
      </div>
    </div>
  );
}

function LinkedRepo({ name }: { name: string }) {
  return (
    <div className="b-repo">
      <RepoHeading name={name} />
      <WorkspaceRow
        workspace={{ ...billingPortal(name), fresh: false }}
        selected={false}
      />
    </div>
  );
}

export function Linked() {
  return (
    <div className="b-card">
      <div className="b-link">
        <LinkedRepo name="acme/web" />
        <div className="b-wire">
          <span>.context/</span>
        </div>
        <LinkedRepo name="acme/api" />
      </div>
      <div className="b-ask">
        <MessageCircleQuestion size={15} />
        <span className="q">{ASK_QUESTION}</span>
        <Button size="sm" variant="primary" icon={GitBranchPlus} tabIndex={-1}>
          Start workspaces
        </Button>
      </div>
    </div>
  );
}

type PhoneRowState = WorkspaceState | 'asks';

interface PhoneRow {
  branch: string;
  state: PhoneRowState;
  add: number;
  del: number;
}

const PHONE_QUESTION = 'Send Retry-After in seconds, or as an HTTP date?';

function PhoneRowIcon({ state }: { state: PhoneRowState }) {
  if (state === 'asks') return <CircleHelp size={16} color="var(--warning)" />;
  return <StateIcon state={state} />;
}

function PhoneRows({ rows }: { rows: PhoneRow[] }) {
  return rows.map((row) => (
    <div
      key={row.branch}
      className={`b-prow${row.state === 'asks' ? ' unread' : ''}`}
    >
      <PhoneRowIcon state={row.state} />
      <span className="b">{row.branch}</span>
      <DiffStat add={row.add} del={row.del} />
    </div>
  ));
}

const API_ROWS: PhoneRow[] = [
  { branch: 'webhook-retries', state: 'merged', add: 61, del: 18 },
  { branch: 'billing-portal', state: 'run', add: 23, del: 4 },
];

export function Phone() {
  const tick = useTick(2600, 3);
  const asking = tick >= 1;
  const webRows: PhoneRow[] = [
    {
      branch: 'rate-limit-headers',
      state: asking ? 'asks' : 'run',
      add: 42,
      del: 7,
    },
    { branch: 'fix-flaky-checkout', state: 'checks', add: 12, del: 3 },
    { branch: 'dark-mode-settings', state: 'open', add: 84, del: 12 },
  ];
  return (
    <div className="b-card b-stage" aria-hidden="true">
      <div className="b-phone">
        <div className="sb">
          <span>9:41</span>
          <span className="isl" />
          <span className="ic">
            <Signal size={13} />
            <Wifi size={13} />
            <BatteryFull size={16} />
          </span>
        </div>
        <div className={`nt${tick === 1 ? ' on' : ''}`}>
          <span className="ap">
            <LogoMark size={18} />
          </span>
          <div>
            <b>rate-limit-headers needs you</b>
            <span>{PHONE_QUESTION}</span>
          </div>
          <span className="t">now</span>
        </div>
        <h4>Workspaces</h4>
        <RepoHeading name="acme/web" />
        <PhoneRows rows={webRows} />
        <RepoHeading name="acme/api" />
        <PhoneRows rows={API_ROWS} />
      </div>
    </div>
  );
}
