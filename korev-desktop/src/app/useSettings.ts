import { useSyncExternalStore } from 'react';
import type { AgentPreference } from '../shared/agents';
import type { MergeTool } from '../shared/merge';
import type { InboxView, Settings, ThemePreference } from '../shared/settings';
import { korev } from './bridge';
import { createBridgeStore } from './store';

const settingsStore = createBridgeStore<Settings>(() => ({
  load: () => korev().settings.load(),
  watch: (listener) => korev().settings.onChanged(listener),
}));

async function applySettings(saving: Promise<Settings>): Promise<void> {
  settingsStore.set(await saving);
}

export function useSettings(): Settings | null {
  return useSyncExternalStore(
    settingsStore.subscribe,
    settingsStore.getSnapshot,
  );
}

export function saveRepos(repos: string[]): Promise<void> {
  return applySettings(korev().settings.setRepos(repos));
}

export function saveTheme(theme: ThemePreference): Promise<void> {
  return applySettings(korev().settings.setTheme(theme));
}

export function saveLastView(view: InboxView): Promise<void> {
  return applySettings(korev().settings.setLastView(view));
}

export function saveMergeWith(repo: string, tool: MergeTool): Promise<void> {
  return applySettings(korev().settings.setMergeWith(repo, tool));
}

export function saveAgent(agent: AgentPreference): Promise<void> {
  return applySettings(korev().settings.setAgent(agent));
}

export function saveCollapsedRepos(
  view: InboxView,
  repos: string[],
): Promise<void> {
  return applySettings(korev().settings.setCollapsedRepos(view, repos));
}
