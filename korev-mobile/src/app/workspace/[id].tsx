import { router, Stack, useLocalSearchParams } from 'expo-router';
import { GitBranch, GitPullRequest } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, Linking, StyleSheet, Text } from 'react-native';
import {
  hasWorktree,
  nextPrStep,
  PR_BADGE_LABELS,
  PR_STEPS,
  prBadge,
  primaryPr,
  type AppState,
  type ChatSession,
  type PrStatus,
  type PrStep,
  type Workspace,
  type WorkspaceRuntime,
} from '../../../../korev-desktop/src/shared/model';
import type { SFSymbol } from 'sf-symbols-typescript';
import {
  crossRepoLead,
  groupRepoName,
  laneRepos,
  waitsForLane,
  workspaceLabel,
} from '../../../../korev-desktop/src/shared/workspaces';
import { attempt } from '../../attempt';
import { Chat } from '../../chat/Chat';
import {
  Capsule,
  ChatAccessory,
  type ChatMenuEntry,
} from '../../chat/ChatHeader';
import { prCapsuleLabel } from '../../chat/chatStatus';
import { RunDecisions } from '../../chat/RunDecisions';
import { useAppState, usePendingAction } from '../../hooks';
import { Loading } from '../../Offline';
import { useConnection } from '../../korev';
import {
  ACTION_STEPS,
  FLOATING_STEPS,
  hasChanges,
  PROMPT_STEPS,
  runStep,
  stepLabel,
} from '../../prActions';
import { TYPE, useTheme, type Theme } from '../../theme';
import { Button } from '../../ui';
import { WorktreePending } from '../../WorktreePending';

const NEEDS_YOU = 'Needs you';
const CAPSULE_ICON_SIZE = 13;

const STEP_ICONS: Partial<Record<PrStep, SFSymbol>> = {
  create: 'arrow.triangle.pull',
  'fix-errors': 'wrench.and.screwdriver',
  'resolve-conflicts': 'arrow.triangle.branch',
  merge: 'arrow.triangle.merge',
  'merge-partial-stack': 'arrow.triangle.merge',
  'merge-stack': 'arrow.triangle.merge',
};

function waitingSessionIds(state: AppState): ReadonlySet<string> {
  return new Set(state.waitingSessions ?? []);
}

function defaultSession(state: AppState, workspace: Workspace) {
  const waiting = waitingSessionIds(state);
  return (
    workspace.sessions.find((entry) => waiting.has(entry.id)) ??
    workspace.sessions.at(-1)
  );
}

function workspaceTitle(state: AppState, workspace: Workspace): string {
  const repo = groupRepoName(state, workspace);
  const label = workspaceLabel(workspace);
  return repo ? `${repo} · ${label}` : label;
}

function waitingHint(state: AppState, workspace: Workspace) {
  const lead = waitsForLane(state, workspace)
    ? crossRepoLead(state, workspace)
    : null;
  if (!lead) return undefined;
  return `This workspace's agent starts when you approve the plan in ${groupRepoName(state, lead)}.`;
}

function sessionSubtitle(
  state: AppState,
  sessionId: string,
): string | undefined {
  if (state.runningSessions.includes(sessionId)) return 'Working';
  if (waitingSessionIds(state).has(sessionId)) return NEEDS_YOU;
  return undefined;
}

function useWorkspaceActions(
  state: AppState,
  workspace: Workspace,
  runtime: WorkspaceRuntime | undefined,
  session: ChatSession | undefined,
  onSelect: (sessionId: string) => void,
) {
  const { api } = useConnection();
  const { pending, run } = usePendingAction();
  const [chosenUrl, setChosenUrl] = useState<string | null>(null);
  const prs = runtime?.prs ?? [];
  const pr = primaryPr(workspace, runtime, chosenUrl);
  const step = nextPrStep(pr);
  const busy = pending !== null;
  const canRunStep = !PROMPT_STEPS.has(step) || Boolean(session);

  const runPrStep = (prStep: PrStep) =>
    void run(prStep, () =>
      runStep(api, prStep, workspace, pr, session?.id ?? ''),
    );

  const explain = () =>
    void run('explain', () =>
      attempt('Korev could not explain the changes', async () => {
        const started = await api.startExplainer({
          kind: 'workspace',
          workspaceId: workspace.id,
        });
        if (started.ok) onSelect(started.value.sessionId);
        return started;
      }),
    );

  const newChat = () =>
    void run('new-chat', () =>
      attempt('Korev could not start a chat', async () => {
        const created = await api.newSession(
          workspace.id,
          state.settings.defaultAgent,
        );
        onSelect(created.id);
      }),
    );

  const confirmCloseChat = (chat: ChatSession) =>
    Alert.alert(
      `Close ${chat.title}?`,
      'Korev removes the chat and its messages.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close',
          style: 'destructive',
          onPress: () =>
            void run('close-chat', () =>
              attempt('Korev could not close the chat', () =>
                api.closeSession(workspace.id, chat.id),
              ),
            ),
        },
      ],
    );

  const openChanges = () =>
    router.push({ pathname: '/changes/[id]', params: { id: workspace.id } });

  const openChecks = () =>
    router.push({
      pathname: '/checks/[id]',
      params: { id: workspace.id, pr: pr?.url ?? '' },
    });

  const chats: ChatMenuEntry = {
    label: 'Chats',
    icon: 'bubble.left.and.bubble.right',
    items: [
      ...workspace.sessions.map((entry) => ({
        label: entry.title,
        subtitle: sessionSubtitle(state, entry.id),
        isOn: entry.id === session?.id,
        onPress: () => onSelect(entry.id),
      })),
      {
        label: 'New chat',
        icon: 'plus.bubble',
        disabled: busy,
        onPress: newChat,
      } satisfies ChatMenuEntry,
      ...(session && workspace.sessions.length > 1
        ? [
            {
              label: 'Close this chat',
              icon: 'xmark.circle' as const,
              destructive: true,
              disabled: busy,
              onPress: () => confirmCloseChat(session),
            },
          ]
        : []),
    ],
  };

  const prItems: ChatMenuEntry[] = [
    ...(ACTION_STEPS.has(step) && step !== 'archive'
      ? [
          {
            label: stepLabel(step, pr),
            icon: STEP_ICONS[step],
            disabled: busy || !canRunStep,
            onPress: () => runPrStep(step),
          },
        ]
      : []),
    ...(pr?.checks.length
      ? [{ label: 'Checks', icon: 'checklist' as const, onPress: openChecks }]
      : []),
    ...(pr
      ? [
          {
            label: 'Open on GitHub',
            icon: 'arrow.up.right.square' as const,
            onPress: () => void Linking.openURL(pr.url),
          },
        ]
      : []),
  ];

  const prChoices: ChatMenuEntry[] =
    pr && prs.length > 1
      ? [
          {
            label: 'Pull requests',
            icon: 'arrow.triangle.pull',
            items: prs.map((entry) => ({
              label: `#${entry.number} ${entry.title}`,
              subtitle: PR_BADGE_LABELS[prBadge(entry)],
              isOn: entry.url === pr.url,
              onPress: () => setChosenUrl(entry.url),
            })),
          },
        ]
      : [];

  const menu: ChatMenuEntry[] = [
    chats,
    ...(hasChanges(runtime)
      ? [
          {
            label: 'Changes',
            icon: 'plus.forwardslash.minus' as const,
            onPress: openChanges,
          },
          {
            label: 'Explain changes',
            icon: 'book' as const,
            disabled: busy,
            onPress: explain,
          },
        ]
      : []),
    { label: 'Pull request', inline: true, items: [...prItems, ...prChoices] },
    {
      label: '',
      inline: true,
      items: [
        {
          label: PR_STEPS.archive.label,
          icon: 'archivebox',
          destructive: step !== 'archive',
          disabled: busy,
          onPress: () => runPrStep('archive'),
        },
      ],
    },
  ];

  const floatingAction = FLOATING_STEPS.has(step) ? (
    <Button
      label={stepLabel(step, pr)}
      variant={PR_STEPS[step].tone}
      pending={pending === step}
      disabled={busy || !canRunStep}
      large
      onPress={() => runPrStep(step)}
    />
  ) : null;

  return { pr, menu, floatingAction, openChecks, openChanges };
}

function WorkspaceAccessory({
  workspace,
  runtime,
  pr,
  onOpenChecks,
  onOpenChanges,
}: {
  workspace: Workspace;
  runtime: WorkspaceRuntime | undefined;
  pr: PrStatus | null;
  onOpenChecks: () => void;
  onOpenChanges: () => void;
}) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const step = pr && nextPrStep(pr);
  const stats = runtime?.stats;
  const diffStat =
    stats && (stats.additions || stats.deletions)
      ? ` · +${stats.additions} −${stats.deletions}`
      : '';
  const tone =
    step === 'fix-errors' || step === 'resolve-conflicts'
      ? theme.dangerText
      : undefined;
  return (
    <ChatAccessory
      footer={
        runtime?.message ? (
          <Text style={styles.message}>{runtime.message}</Text>
        ) : null
      }
    >
      <Capsule
        icon={<GitBranch size={CAPSULE_ICON_SIZE} color={theme.fg3} />}
        label={`${workspace.branch} → ${workspace.baseBranch}${diffStat}`}
        accessibilityLabel={diffStat ? 'Show the changes' : undefined}
        onPress={diffStat ? onOpenChanges : undefined}
      />
      <Capsule
        icon={
          <GitPullRequest size={CAPSULE_ICON_SIZE} color={tone ?? theme.fg3} />
        }
        label={prCapsuleLabel(pr)}
        tone={tone}
        accessibilityLabel={pr?.checks.length ? 'Show the checks' : undefined}
        onPress={pr?.checks.length ? onOpenChecks : undefined}
      />
    </ChatAccessory>
  );
}

function WorkspaceChat({
  state,
  workspace,
  runtime,
  session,
  onSelect,
}: {
  state: AppState;
  workspace: Workspace;
  runtime: WorkspaceRuntime | undefined;
  session: ChatSession | undefined;
  onSelect: (sessionId: string) => void;
}) {
  const styles = makeStyles(useTheme());
  const { pr, menu, floatingAction, openChecks, openChanges } =
    useWorkspaceActions(state, workspace, runtime, session, onSelect);
  const waiting = waitingSessionIds(state);
  const otherChatWaits = workspace.sessions.some(
    (entry) => entry.id !== session?.id && waiting.has(entry.id),
  );
  const coordinatedRun = state.runs?.findLast((run) =>
    workspace.sessions.some((entry) => entry.id === run.coordinatorSessionId),
  );
  const accessory = (
    <>
      <WorkspaceAccessory
        workspace={workspace}
        runtime={runtime}
        pr={pr}
        onOpenChecks={openChecks}
        onOpenChanges={openChanges}
      />
      {coordinatedRun ? <RunDecisions run={coordinatedRun} /> : null}
    </>
  );

  if (!session)
    return (
      <>
        <Stack.Screen options={{ title: workspaceTitle(state, workspace) }} />
        {accessory}
        <Text style={styles.empty}>This workspace has no chats.</Text>
      </>
    );
  return (
    <Chat
      key={session.id}
      state={state}
      session={session}
      repoId={workspace.repoId}
      title={workspaceTitle(state, workspace)}
      subtitle={workspace.sessions.length > 1 ? session.title : undefined}
      pr={pr}
      menu={menu}
      menuBadge={otherChatWaits ? '1' : undefined}
      accessory={accessory}
      floatingAction={floatingAction}
      laneRepos={laneRepos(state, workspace)}
      emptyHint={waitingHint(state, workspace)}
      onHandoff={onSelect}
    />
  );
}

export default function WorkspaceScreen() {
  const { id, sessionId } = useLocalSearchParams<{
    id: string;
    sessionId?: string;
  }>();
  const state = useAppState();
  const styles = makeStyles(useTheme());
  const [selectedId, setSelectedId] = useState(sessionId);
  const workspace = state?.workspaces.find((entry) => entry.id === id);
  const runtime = workspace && state?.runtime[workspace.id];
  const archiving = !!workspace?.archivedAt || runtime?.status === 'archiving';
  useEffect(() => {
    if (archiving) router.dismissTo('/');
  }, [archiving]);

  if (!state) return <Loading style={styles.fill} />;
  if (!workspace)
    return <Text style={styles.empty}>This workspace no longer exists.</Text>;
  if (runtime && !hasWorktree(runtime))
    return (
      <>
        <Stack.Screen options={{ title: workspaceTitle(state, workspace) }} />
        <WorktreePending workspace={workspace} runtime={runtime} />
      </>
    );
  const session =
    workspace.sessions.find((entry) => entry.id === selectedId) ??
    defaultSession(state, workspace);
  if (session && session.id !== selectedId) setSelectedId(session.id);

  return (
    <WorkspaceChat
      state={state}
      workspace={workspace}
      runtime={runtime}
      session={session}
      onSelect={setSelectedId}
    />
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    fill: { flex: 1 },
    empty: { padding: 24, color: theme.fg3, textAlign: 'center' },
    message: {
      ...TYPE.footnote,
      paddingHorizontal: 16,
      color: theme.dangerText,
    },
  });
}
