import { useState } from 'react';
import {
  Avatar,
  Badge,
  Banner,
  BannerGroup,
  Button,
  Card,
  Checkbox,
  DiffHunk,
  DiffStat,
  Dialog,
  EmptyState,
  FileRow,
  Finding,
  IconButton,
  Input,
  Kbd,
  Logo,
  Radio,
  RiskBadge,
  Select,
  SidePanel,
  SidebarNav,
  SizeBadge,
  Skeleton,
  Switch,
  Tabs,
  Tag,
  Toast,
  Tooltip,
  CheckboxMenu,
  type BannerItem,
  type CheckboxMenuGroup,
  type SidebarNavItem,
} from '../../design-system';
import { ActionChip } from '../inbox/action-state';
import { GroupHeader } from '../inbox/GroupHeader';
import { ApprovalBadge } from '../inbox/ReviewRow';
import { ToggleRow } from '../inbox/ToggleRow';
import { UnlockStep } from '../setup/UnlockStep';
import { Row, Section } from './Section';
import {
  SAMPLE_FILES,
  SAMPLE_FINDINGS,
  SAMPLE_HUNK,
  SAMPLE_NOTE_LINE,
} from './sample-data';

export function BrandSection() {
  return (
    <Section title="Brand">
      <Row>
        <Logo size={28} />
        <Logo variant="mark" size={28} />
        <span className="text-accent-text">
          <Logo size={28} mono />
        </span>
      </Row>
    </Section>
  );
}

export function ButtonSection() {
  return (
    <Section title="Buttons">
      <Row>
        <Button variant="primary" icon="check" kbd="⌘↵">
          Approve
        </Button>
        <Button>Request changes</Button>
        <Button variant="ghost" icon="message-square">
          Ask Korev
        </Button>
        <Button variant="danger">Dismiss</Button>
        <Button variant="success" icon="git-merge">
          Merge
        </Button>
        <Button variant="primary" loading>
          Run review
        </Button>
        <Button disabled>Suggest fix</Button>
      </Row>
      <Row>
        <Button size="sm">Small</Button>
        <Button size="md">Medium</Button>
        <Button size="lg" iconRight="arrow-right">
          Large
        </Button>
        <IconButton icon="copy" label="Copy" />
        <IconButton icon="panel-right" label="Toggle panel" active />
        <IconButton icon="search" label="Search" variant="secondary" />
        <IconButton icon="x" label="Close" size="sm" />
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </Row>
    </Section>
  );
}

export function FormSection() {
  const [search, setSearch] = useState('');
  const [repo, setRepo] = useState('acme/api');
  const [notify, setNotify] = useState(true);
  const [autoReview, setAutoReview] = useState(false);
  const [depth, setDepth] = useState<string | undefined>('thorough');
  return (
    <Section title="Forms">
      <div className="grid grid-cols-3 gap-4">
        <Input
          label="Search"
          icon="search"
          placeholder="Search or jump to…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          suffix={<Kbd>/</Kbd>}
        />
        <Input
          label="Path glob"
          mono
          placeholder="src/**/*.ts"
          hint="Matches files Korev reviews."
        />
        <Input
          label="Branch"
          defaultValue="main"
          error="Branch is protected."
        />
        <Select
          label="Repository"
          icon="folder-git-2"
          value={repo}
          onChange={setRepo}
          options={['acme/api', 'acme/billing', 'acme/web']}
        />
        <Input label="Disabled" placeholder="Not editable" disabled />
      </div>
      <Row>
        <Checkbox label="Notify me" checked={notify} onChange={setNotify} />
        <Checkbox label="Some files" indeterminate />
        <Checkbox label="Disabled" disabled />
        <Switch
          label="Review automatically"
          checked={autoReview}
          onChange={setAutoReview}
        />
        <Radio
          name="depth"
          value="quick"
          label="Quick"
          checked={depth === 'quick'}
          onChange={setDepth}
        />
        <Radio
          name="depth"
          value="thorough"
          label="Thorough"
          checked={depth === 'thorough'}
          onChange={setDepth}
        />
      </Row>
    </Section>
  );
}

export function DisplaySection() {
  return (
    <Section title="Display">
      <Row>
        <Badge>Draft</Badge>
        <Badge tone="accent" dot>
          Reviewing
        </Badge>
        <Badge tone="success">Approved</Badge>
        <Badge tone="warning">Waiting</Badge>
        <Badge tone="danger">Blocked</Badge>
        <Badge outline>Concurrency</Badge>
        <Badge count tone="accent">
          3
        </Badge>
        <Tag icon="git-branch" mono>
          feat/tenant-rate-limit
        </Tag>
        <Tag onRemove={() => undefined}>acme/api</Tag>
        <Avatar name="Maya Okafor" />
        <Avatar name="Jun Park" size={28} />
        <Avatar kind="korev" size={28} />
      </Row>
      <div className="grid grid-cols-2 gap-4">
        <Card
          title="Summary"
          icon="file-code-2"
          actions={<Badge>5 findings · 2 high</Badge>}
        >
          Replaces the IP-based legacy throttle with a per-tenant token bucket
          stored in Redis. Most of the 412 added lines are tests and docs.
        </Card>
        <Card interactive>
          <div className="flex items-center justify-between">
            <span className="type-h3">#491 Per-tenant rate limiting</span>
            <DiffStat additions={412} deletions={96} />
          </div>
        </Card>
      </div>
    </Section>
  );
}

export function NavigationSection() {
  const [tab, setTab] = useState('files');
  const [mode, setMode] = useState('unified');
  return (
    <Section title="Navigation">
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: 'Overview', icon: 'git-pull-request' },
          { id: 'files', label: 'Files', icon: 'file-code-2', count: 14 },
          { id: 'findings', label: 'Findings', icon: 'list-checks', count: 5 },
        ]}
      />
      <Tabs
        variant="pill"
        value={mode}
        onChange={setMode}
        tabs={[
          { id: 'unified', label: 'Unified' },
          { id: 'split', label: 'Split' },
        ]}
      />
    </Section>
  );
}

const SAMPLE_REPO_GROUPS: CheckboxMenuGroup[] = [
  {
    id: 'acme',
    label: 'acme',
    items: ['api', 'web', 'billing'].map((name) => ({
      id: `acme/${name}`,
      label: name,
    })),
  },
  {
    id: 'thiago',
    label: 'thiago',
    items: [{ id: 'thiago/korev', label: 'korev' }],
  },
];

const SAMPLE_REPOS = SAMPLE_REPO_GROUPS.flatMap((group) =>
  group.items.map((item) => item.id),
);

function CheckboxMenuSample() {
  const [selected, setSelected] = useState(SAMPLE_REPOS.slice(0, 2));
  return (
    <CheckboxMenu
      label="Repo filter"
      triggerLabel={`${selected.length} of ${SAMPLE_REPOS.length} repos`}
      triggerIcon="funnel"
      triggerClassName="text-accent-text"
      groups={SAMPLE_REPO_GROUPS}
      selected={selected}
      onChange={setSelected}
      resetLabel="Show all repos"
      onReset={() => setSelected(SAMPLE_REPOS)}
    />
  );
}

export function OverlaySection() {
  const [dialogOpen, setDialogOpen] = useState(false);
  return (
    <Section title="Overlays">
      <Row>
        <Button onClick={() => setDialogOpen(true)}>Open dialog</Button>
        <Tooltip label="Copy SHA" kbd="C">
          <IconButton icon="copy" label="Copy SHA" />
        </Tooltip>
        <Tooltip label="Shown below" side="bottom">
          <Button size="sm">Hover me</Button>
        </Tooltip>
        <CheckboxMenuSample />
      </Row>
      <div className="flex flex-col gap-2">
        <Toast
          tone="success"
          title="Review posted — 3 comments on #482"
          onClose={() => undefined}
        />
        <Toast
          tone="accent"
          title="Korev is reviewing #479"
          description="Reading limiter.ts…"
        />
        <Toast
          tone="danger"
          title="Review failed"
          description="GitHub returned 502 for acme/api."
          action={<Button size="sm">Retry</Button>}
        />
      </div>
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Approve with 2 open findings?"
        description="Both are high severity. They stay open on the pull request."
        footer={
          <>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => setDialogOpen(false)}>
              Approve anyway
            </Button>
          </>
        }
      />
    </Section>
  );
}

export function ReviewSection() {
  const [activeFile, setActiveFile] = useState(SAMPLE_FILES[0].path);
  const [noteFinding] = SAMPLE_FINDINGS;
  return (
    <Section title="Review">
      <Row>
        <RiskBadge level="critical" />
        <RiskBadge level="high" />
        <RiskBadge level="medium" />
        <RiskBadge level="low" />
        <RiskBadge level="high" iconOnly />
        <DiffStat additions={64} deletions={12} />
      </Row>
      <div className="grid grid-cols-[260px_1fr] gap-4">
        <div className="flex flex-col gap-px">
          {SAMPLE_FILES.map((file) => (
            <FileRow
              key={file.path}
              {...file}
              active={file.path === activeFile}
              onClick={() => setActiveFile(file.path)}
            />
          ))}
        </div>
        <div className="overflow-hidden rounded-md border border-border-1">
          <DiffHunk
            lines={SAMPLE_HUNK}
            notes={{
              [SAMPLE_NOTE_LINE]: (
                <Finding
                  level={noteFinding.level}
                  category={noteFinding.category}
                  title={noteFinding.title}
                  active
                  actions={
                    <>
                      <Button size="sm" variant="primary">
                        Suggest fix
                      </Button>
                      <Button size="sm" variant="ghost">
                        Dismiss
                      </Button>
                    </>
                  }
                >
                  {noteFinding.body}
                </Finding>
              ),
            }}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {SAMPLE_FINDINGS.map(({ id, body, ...finding }) => (
          <Finding key={id} {...finding}>
            {body}
          </Finding>
        ))}
      </div>
    </Section>
  );
}

const SAMPLE_NAV_ITEMS: SidebarNavItem<string>[] = [
  {
    id: 'review',
    label: 'Review requests',
    icon: 'inbox',
    badge: { count: 5, tone: 'danger', label: '5 waiting' },
  },
  {
    id: 'open',
    label: 'Open',
    icon: 'git-pull-request',
    badge: { count: 0, tone: 'neutral', label: '0 need you' },
  },
  {
    id: 'ready',
    label: 'Ready to merge',
    icon: 'git-merge',
    badge: { count: 2, tone: 'success', label: '2 ready to merge' },
  },
  {
    id: 'stale',
    label: 'Stale',
    icon: 'clock',
    badge: { count: 1, tone: 'neutral', label: '1 stale' },
  },
];

const SAMPLE_BANNERS: BannerItem[] = [
  {
    id: 'offline',
    tone: 'warning',
    message: 'Offline · showing data from 14:02 · retrying at 14:05',
  },
  {
    id: 'auth',
    tone: 'danger',
    message: 'GitHub access was revoked',
    action: { label: 'Reconnect', onClick: () => undefined },
  },
  { id: 'stacks', tone: 'neutral', message: 'Stack relationships unavailable' },
];

function BannerSamples() {
  return (
    <div className="flex flex-col gap-2">
      <Banner tone="warning">Rate limited · resumes 14:20 · in 3:12</Banner>
      <Banner
        tone="danger"
        action={{ label: 'Reconnect', onClick: () => undefined }}
      >
        GitHub access was revoked
      </Banner>
      <Banner
        tone="neutral"
        action={{ label: 'Narrow repos', onClick: () => undefined }}
      >
        Showing 300 PRs — more aren't loaded
      </Banner>
      <BannerGroup items={SAMPLE_BANNERS} />
    </div>
  );
}

function SidePanelSample() {
  const [open, setOpen] = useState(true);
  return (
    <div className="flex h-72 overflow-hidden rounded-md border border-border-1">
      <div className="flex flex-1 items-center justify-center text-fg-3">
        {open ? null : (
          <Button size="sm" onClick={() => setOpen(true)}>
            Open panel
          </Button>
        )}
      </div>
      {open ? (
        <SidePanel
          label="Sample panel"
          onClose={() => setOpen(false)}
          header={
            <div className="text-xs text-fg-3">
              <span className="font-mono">acme/api#491</span> · @octocat
            </div>
          }
          footer={
            <Button variant="primary" kbd="⌘↵" className="w-full">
              Open on GitHub
            </Button>
          }
        >
          <h2 className="m-0 mt-1 type-h3 text-fg-1">
            Rate-limit per tenant on ingestion endpoints
          </h2>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge tone="danger">2 checks failing</Badge>
            <Badge tone="warning">3 unresolved threads</Badge>
            <Badge>Mergeability unknown</Badge>
          </div>
        </SidePanel>
      ) : null}
    </div>
  );
}

function SectionHeaderSamples() {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="rounded-md border border-border-1">
      <GroupHeader label="Needs you" count={3} tone="danger" />
      <GroupHeader
        label="Ready to merge"
        count={2}
        tone="success"
        toggle={{
          optionKey: 'gallery-ready',
          expanded,
          onToggle: () => setExpanded((current) => !current),
        }}
      />
      <GroupHeader
        label="In progress"
        count={5}
        tone="neutral"
        toggle={{
          optionKey: 'gallery-in-progress',
          expanded: false,
          onToggle: () => undefined,
        }}
      />
      <ToggleRow
        optionKey="gallery-approved"
        expanded={false}
        onToggle={() => undefined}
        className="pl-5"
      >
        Already approved
        <span className="font-mono text-fg-2">2</span>
      </ToggleRow>
      <div className="flex flex-wrap gap-2 px-5 py-2">
        <ApprovalBadge approval={{ kind: 'teammate', login: 'sakce' }} />
        <ApprovalBadge approval={{ kind: 'bot', login: 'stamphog' }} />
        <ActionChip state={{ kind: 'merging', numbers: [301, 303] }} />
        <ActionChip state={{ kind: 'still-merging', numbers: [301] }} />
        <ActionChip state={{ kind: 'merge-failed', message: 'lint' }} />
        <Badge>In Trunk queue</Badge>
        <Badge tone="warning">Removed from Trunk queue</Badge>
      </div>
    </div>
  );
}

export function InboxSection() {
  const [view, setView] = useState('review');
  return (
    <Section title="Inbox">
      <Row>
        <SizeBadge size="S" lines={42} files={3} />
        <SizeBadge size="M" lines={612} files={23} />
        <SizeBadge size="L" lines={4810} files={100} filesTruncated />
      </Row>
      <div className="grid grid-cols-[248px_56px_1fr] gap-4">
        <SidebarNav
          label="Sample navigation"
          items={SAMPLE_NAV_ITEMS}
          value={view}
          onChange={setView}
        />
        <SidebarNav
          label="Sample compact navigation"
          items={SAMPLE_NAV_ITEMS}
          value={view}
          onChange={setView}
          compact
        />
        <div className="flex flex-col gap-2 rounded-md border border-border-1 p-4">
          <Skeleton className="w-2/3" />
          <Skeleton className="h-2.5 w-1/3" />
        </div>
      </div>
      <div className="rounded-md border border-border-1">
        <EmptyState
          icon="inbox"
          title="No reviews waiting on you."
          description="Synced 2m ago"
          action={<Button size="sm">Refresh</Button>}
        />
      </div>
      <SectionHeaderSamples />
      <BannerSamples />
      <SidePanelSample />
      <div className="w-105 rounded-lg border border-border-2 bg-surface p-7">
        <UnlockStep failures={2} />
      </div>
    </Section>
  );
}
