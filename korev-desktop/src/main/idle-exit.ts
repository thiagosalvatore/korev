export interface Activity {
  runningAgents: number;
  connectedDevices: number;
}

export interface IdleWatch {
  shouldExit(activity: Activity): boolean;
}

function isBusy(activity: Activity): boolean {
  return activity.runningAgents > 0 || activity.connectedDevices > 0;
}

export function createIdleWatch(limitMs: number, now: () => number): IdleWatch {
  let idleSince = now();
  return {
    shouldExit(activity) {
      if (isBusy(activity)) {
        idleSince = now();
        return false;
      }
      return now() - idleSince >= limitMs;
    },
  };
}
