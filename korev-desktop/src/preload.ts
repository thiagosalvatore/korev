// oxlint-disable eslint-plugin-unicorn/no-empty-file
// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IpcChannel, type KorevBridge } from './shared/ipc-contract';

function invoke<T>(channel: IpcChannel, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args) as Promise<T>;
}

function subscribe<T>(channel: IpcChannel, listener: (payload: T) => void) {
  const forward = (_event: IpcRendererEvent, payload: T) => listener(payload);
  ipcRenderer.on(channel, forward);
  return () => {
    ipcRenderer.removeListener(channel, forward);
  };
}

const bridge: KorevBridge = {
  inbox: {
    load: () => invoke(IpcChannel.InboxLoad),
    refresh: () => invoke(IpcChannel.InboxRefresh),
    onUpdated: (listener) => subscribe(IpcChannel.InboxUpdated, listener),
  },
  auth: {
    getState: () => invoke(IpcChannel.AuthGetState),
    startDeviceFlow: () => invoke(IpcChannel.AuthStartDeviceFlow),
    cancelDeviceFlow: () => invoke(IpcChannel.AuthCancelDeviceFlow),
    useToken: (token) => invoke(IpcChannel.AuthUseToken, token),
    disconnect: () => invoke(IpcChannel.AuthDisconnect),
    retryUnlock: () => invoke(IpcChannel.AuthRetryUnlock),
    onChanged: (listener) => subscribe(IpcChannel.AuthChanged, listener),
  },
  settings: {
    load: () => invoke(IpcChannel.SettingsLoad),
    setRepos: (repos) => invoke(IpcChannel.SettingsSetRepos, repos),
    setTheme: (theme) => invoke(IpcChannel.SettingsSetTheme, theme),
    setLastView: (view) => invoke(IpcChannel.SettingsSetLastView, view),
    setCollapsedSection: (section, collapsed) =>
      invoke(IpcChannel.SettingsSetCollapsedSection, section, collapsed),
    setMergeWith: (repo, tool) =>
      invoke(IpcChannel.SettingsSetMergeWith, repo, tool),
    setAgent: (agent) => invoke(IpcChannel.SettingsSetAgent, agent),
    setKept: (refs, kept) => invoke(IpcChannel.SettingsSetKept, refs, kept),
    setRepoFilter: (view, repos) =>
      invoke(IpcChannel.SettingsSetRepoFilter, view, repos),
    setAiTasks: (patch) => invoke(IpcChannel.SettingsSetAiTasks, patch),
    suggestedRepos: () => invoke(IpcChannel.SettingsSuggestedRepos),
    onChanged: (listener) => subscribe(IpcChannel.SettingsChanged, listener),
  },
  repos: {
    owners: () => invoke(IpcChannel.ReposOwners),
    page: (owner, cursor) => invoke(IpcChannel.ReposPage, owner, cursor),
    search: (owner, term) => invoke(IpcChannel.ReposSearch, owner, term),
  },
  pr: {
    merge: (request) => invoke(IpcChannel.PrMerge, request),
    close: (targets) => invoke(IpcChannel.PrClose, targets),
    reopen: (target) => invoke(IpcChannel.PrReopen, target),
    cancelQueue: (target) => invoke(IpcChannel.PrCancelQueue, target),
  },
  agents: {
    statuses: () => invoke(IpcChannel.AgentsStatuses),
    signIn: (provider) => invoke(IpcChannel.AgentsSignIn, provider),
    cancelSignIn: () => invoke(IpcChannel.AgentsCancelSignIn),
    models: (provider) => invoke(IpcChannel.AgentsModels, provider),
    test: (provider) => invoke(IpcChannel.AgentsTest, provider),
  },
  ai: {
    start: (target, kind) => invoke(IpcChannel.AiStart, target, kind),
    explain: (target, regenerate) =>
      invoke(IpcChannel.AiExplain, target, regenerate),
    explanation: (target) => invoke(IpcChannel.AiExplanation, target),
    openExplanation: (target) => invoke(IpcChannel.AiOpenExplanation, target),
    answer: (target, answers) => invoke(IpcChannel.AiAnswer, target, answers),
    cancel: (target) => invoke(IpcChannel.AiCancel, target),
    dismiss: (target) => invoke(IpcChannel.AiDismiss, target),
    saveReviewDraft: (target, draft) =>
      invoke(IpcChannel.AiSaveReviewDraft, target, draft),
    submitReview: (target, review) =>
      invoke(IpcChannel.AiSubmitReview, target, review),
    checkoutsSize: () => invoke(IpcChannel.AiCheckoutsSize),
    removeCheckouts: () => invoke(IpcChannel.AiRemoveCheckouts),
    activityLog: (target) => invoke(IpcChannel.AiActivityLog, target),
    onActivity: (listener) => subscribe(IpcChannel.AiActivity, listener),
  },
  terminal: {
    open: (target, size) => invoke(IpcChannel.TerminalOpen, target, size),
    write: (target, data) => invoke(IpcChannel.TerminalWrite, target, data),
    resize: (target, size) => invoke(IpcChannel.TerminalResize, target, size),
    close: (target) => invoke(IpcChannel.TerminalClose, target),
    onOutput: (listener) => subscribe(IpcChannel.TerminalOutput, listener),
    onExit: (listener) => subscribe(IpcChannel.TerminalExit, listener),
  },
  shell: {
    openGithub: (url) => invoke(IpcChannel.ShellOpenGithub, url),
    openAgentInstall: (provider) =>
      invoke(IpcChannel.ShellOpenAgentInstall, provider),
  },
  app: {
    onCommand: (listener) => subscribe(IpcChannel.AppCommand, listener),
    onFocusPr: (listener) => subscribe(IpcChannel.AppFocusPr, listener),
  },
};

contextBridge.exposeInMainWorld('korev', bridge);
