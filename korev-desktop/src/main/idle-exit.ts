export interface Activity {
  runningAgents: number;
  connectedDevices: number;
}

export interface IdleWatch {
  idleTooLong(activity: Activity): boolean;
}

export interface IdleWatchOptions {
  limitMs: number;
  checkIntervalMs: number;
  now(): number;
}

const FROZEN_GAP_IN_CHECKS = 2;

function isBusy(activity: Activity): boolean {
  return activity.runningAgents > 0 || activity.connectedDevices > 0;
}

export function createIdleWatch(options: IdleWatchOptions): IdleWatch {
  const frozenGapMs = options.checkIntervalMs * FROZEN_GAP_IN_CHECKS;
  let idleSince = options.now();
  let lastCheck = idleSince;
  return {
    idleTooLong(activity) {
      const time = options.now();
      const wasFrozen = time - lastCheck > frozenGapMs;
      lastCheck = time;
      if (wasFrozen || isBusy(activity)) {
        idleSince = time;
        return false;
      }
      return time - idleSince >= options.limitMs;
    },
  };
}
