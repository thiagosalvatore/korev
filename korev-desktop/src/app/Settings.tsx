import { useState } from 'react';
import { version } from '../../package.json';
import {
  Avatar,
  Button,
  Card,
  SidebarNav,
  Tabs,
  Toast,
  type SidebarNavItem,
} from '../design-system';
import type { AuthState, Connection, ConnectionMethod } from '../shared/auth';
import type { InboxSnapshot } from '../shared/inbox';
import type { Settings, ThemePreference } from '../shared/settings';
import { AgentsCard } from './agents/AgentsCard';
import { korev } from './bridge';
import { pluralize } from './format';
import { InboxOrder } from './repos/InboxOrder';
import { RepoPicker } from './repos/RepoPicker';
import { uniqueRepos } from './repos/repo-name';
import { TokenForm } from './setup/TokenForm';
import { disconnect } from './useAuthState';
import { saveRepos, saveTheme } from './useSettings';
import { useTimedToast } from './useTimedToast';

const GITHUB_APPLICATIONS_URL = 'https://github.com/settings/applications';

const REPO_TOAST_MS = 5000;

interface RepoToast {
  message: string;
  restore: string[] | null;
}

const METHOD_LABELS: Record<ConnectionMethod, string> = {
  oauth: 'Connected with GitHub',
  token: 'Connected with a token',
};

const THEME_TABS: { id: ThemePreference; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

type SettingsSection = 'github' | 'repositories' | 'agents' | 'general';

const GITHUB_SECTION: SidebarNavItem<SettingsSection> = {
  id: 'github',
  label: 'GitHub',
  icon: 'circle-user-round',
};

const APP_SECTIONS: SidebarNavItem<SettingsSection>[] = [
  { id: 'repositories', label: 'Repositories', icon: 'folder-git-2' },
  { id: 'agents', label: 'AI agents', icon: 'bot-message-square' },
  { id: 'general', label: 'General', icon: 'sliders-horizontal' },
];

function sectionsFor(
  connection: Connection | null,
): SidebarNavItem<SettingsSection>[] {
  return connection ? [GITHUB_SECTION, ...APP_SECTIONS] : APP_SECTIONS;
}

function themeById(id: string): ThemePreference | undefined {
  return THEME_TABS.find((tab) => tab.id === id)?.id;
}

interface AccountCardProps {
  connection: Connection;
  authLost: boolean;
}

function AccountCard({ connection, authLost }: AccountCardProps) {
  return (
    <Card title="Account">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar
          name={connection.login}
          src={connection.avatarUrl ?? undefined}
          size={36}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate type-h3 text-fg-1">@{connection.login}</div>
          <div className="text-xs text-fg-3">
            {METHOD_LABELS[connection.method]}
          </div>
        </div>
        <Button
          variant="ghost"
          iconRight="external-link"
          onClick={() => void korev().shell.openGithub(GITHUB_APPLICATIONS_URL)}
        >
          Manage access on GitHub
        </Button>
        <Button variant="danger" onClick={() => void disconnect()}>
          Disconnect
        </Button>
      </div>
      {authLost ? (
        <p className="mt-3 mb-0 text-xs text-danger-text">
          GitHub no longer accepts the saved sign-in. Disconnect, then connect
          again.
        </p>
      ) : null}
      <div className="mt-4">
        <TokenForm />
      </div>
    </Card>
  );
}

interface RepoToastViewProps {
  toast: RepoToast;
  onUndo: (repos: string[]) => void;
  onClose: () => void;
}

function RepoToastView({ toast, onUndo, onClose }: RepoToastViewProps) {
  const { restore } = toast;
  return (
    <div className="fixed right-5 bottom-5 z-50">
      <Toast
        title={toast.message}
        onClose={onClose}
        action={
          restore ? (
            <Button size="sm" onClick={() => onUndo(restore)}>
              Undo
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}

interface RepositoriesCardProps {
  settings: Settings;
  repoMerge: InboxSnapshot['repoMerge'];
}

function RepositoriesCard({ settings, repoMerge }: RepositoriesCardProps) {
  const { repos } = settings;
  const [unwatched, setUnwatched] = useState<string[]>([]);
  const { toast, show, dismiss } = useTimedToast<RepoToast>(REPO_TOAST_MS);

  function watch(repo: string) {
    void saveRepos(uniqueRepos(repos, [repo]));
    show({ message: `Watching ${repo}`, restore: null });
  }

  function unwatch(repo: string) {
    setUnwatched((current) => uniqueRepos(current, [repo]));
    void saveRepos(repos.filter((watched) => watched !== repo));
    show({ message: `Stopped watching ${repo}`, restore: repos });
  }

  function undo(restore: string[]) {
    dismiss();
    void saveRepos(restore);
  }

  return (
    <Card title={`Watching ${pluralize(repos.length, 'repo')}`}>
      <RepoPicker
        pinned={{
          title: 'Selected',
          repos: uniqueRepos(repos, unwatched),
          emptyMessage: 'No repos selected yet.',
        }}
        selected={repos}
        onToggle={(repo, checked) => (checked ? watch(repo) : unwatch(repo))}
      />
      {repos.length > 0 ? (
        <InboxOrder
          repos={repos}
          mergeWith={settings.mergeWith}
          repoMerge={repoMerge}
        />
      ) : null}
      {toast ? (
        <RepoToastView toast={toast} onUndo={undo} onClose={dismiss} />
      ) : null}
    </Card>
  );
}

function AppearanceCard({ theme }: { theme: ThemePreference }) {
  function select(id: string) {
    const next = themeById(id);
    if (next) void saveTheme(next);
  }
  return (
    <Card title="Appearance">
      <Tabs variant="pill" value={theme} onChange={select} tabs={THEME_TABS} />
    </Card>
  );
}

function AboutCard({ stacksUnavailable }: { stacksUnavailable: boolean }) {
  return (
    <Card title="About">
      <div className="type-h3 text-fg-1">Korev</div>
      <p className="mt-1 mb-0 text-xs text-fg-3">
        Version {version} · Your PRs, sorted by what needs you.
      </p>
      {stacksUnavailable ? (
        <p className="mt-3 mb-0 text-xs text-warning-text">
          Stack view unavailable: GitHub changed the API
        </p>
      ) : null}
    </Card>
  );
}

export interface SettingsPageProps {
  auth: AuthState;
  settings: Settings;
  snapshot: InboxSnapshot | null;
}

interface SectionContentProps extends SettingsPageProps {
  section: SettingsSection;
}

function SectionContent({
  section,
  auth,
  settings,
  snapshot,
}: SectionContentProps) {
  if (section === 'github' && auth.connection) {
    return (
      <AccountCard
        connection={auth.connection}
        authLost={snapshot?.status === 'auth_lost'}
      />
    );
  }
  if (section === 'agents') {
    return <AgentsCard preference={settings.agent} />;
  }
  if (section === 'general') {
    return (
      <>
        <AppearanceCard theme={settings.theme} />
        <AboutCard stacksUnavailable={snapshot?.stacksUnavailable ?? false} />
      </>
    );
  }
  return (
    <RepositoriesCard
      settings={settings}
      repoMerge={snapshot?.repoMerge ?? {}}
    />
  );
}

export function SettingsPage(props: SettingsPageProps) {
  const sections = sectionsFor(props.auth.connection);
  const [section, setSection] = useState(sections[0].id);
  const current = sections.some(({ id }) => id === section)
    ? section
    : sections[0].id;
  return (
    <div className="flex max-w-210 gap-6 px-6 py-6">
      <SidebarNav
        label="Settings"
        items={sections}
        value={current}
        onChange={setSection}
        className="sticky top-6 w-44 shrink-0 self-start"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <SectionContent section={current} {...props} />
      </div>
    </div>
  );
}
