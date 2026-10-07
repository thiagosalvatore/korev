import {
  AGENT_LABELS,
  loadoutKey,
  type AgentKind,
  type AppState,
  type ChatSession,
  type ModelChoice,
} from '../shared/model';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function timeAgo(iso: string, now = Date.now()): string {
  const elapsed = now - Date.parse(iso);
  if (elapsed < MINUTE_MS) return 'just now';
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)}m ago`;
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)}h ago`;
  return `${Math.floor(elapsed / DAY_MS)}d ago`;
}

export function duration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function modelLabel(state: AppState, session: ChatSession): string {
  const agent = state.agents.find((entry) => entry.agent === session.agent);
  const model = agent?.models.find((entry) => entry.id === session.model);
  return model?.label ?? (session.model || AGENT_LABELS[session.agent]);
}

export function fileName(path: string): string {
  return path.split('/').at(-1) ?? path;
}

export function dirName(path: string): string {
  return path.split('/').slice(0, -1).join('/');
}

export function modelChoices(
  state: AppState,
  current: AgentKind,
): ModelChoice[] {
  return state.agents
    .filter((entry) => entry.version || entry.agent === current)
    .flatMap((entry) =>
      entry.models.map((model) => ({ ...model, agent: entry.agent })),
    );
}

export function loadoutChoices(
  state: AppState,
  current: AgentKind,
): ModelChoice[] {
  const choices = modelChoices(state, current);
  return state.settings.loadout.flatMap((key) =>
    choices.filter((choice) => loadoutKey(choice.agent, choice.id) === key),
  );
}
