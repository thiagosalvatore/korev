'use client';

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Archive,
  ChevronRight,
  FileCode2,
  FolderTree,
  GitBranchPlus,
  GitMerge,
  GitPullRequestArrow,
  MessageCircleQuestion,
  Send,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { Button, type ButtonVariant } from '@/components/ds/Button';
import { DiffHunk } from '@/components/ds/DiffHunk';
import {
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
