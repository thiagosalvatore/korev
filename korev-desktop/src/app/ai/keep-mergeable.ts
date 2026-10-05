import type { AiTaskSettings } from '../../shared/agent-tasks';
import { saveAiTasks } from '../useSettings';

export function saveKeepMergeable(
  settings: AiTaskSettings,
  ref: string | null,
  on: boolean,
): Promise<void> {
  const { keepMergeable } = settings;
  return saveAiTasks({
    keepMergeableIntroSeen: settings.keepMergeableIntroSeen || on,
    keepMergeable:
      ref === null
        ? { allMine: on, prs: {} }
        : { ...keepMergeable, prs: { ...keepMergeable.prs, [ref]: on } },
  });
}

export function needsIntro(settings: AiTaskSettings, on: boolean): boolean {
  return on && !settings.keepMergeableIntroSeen;
}
