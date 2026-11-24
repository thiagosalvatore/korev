import type { IconName } from '../design-system';
import type { AgentKind } from '../shared/model';

export const AGENT_ICONS: Record<AgentKind, IconName> = {
  claude: 'sparkle',
  codex: 'hexagon',
  opencode: 'square-terminal',
};
