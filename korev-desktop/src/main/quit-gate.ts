import type { QuitChoice } from '../shared/api';

export interface QuitGateDeps {
  runningAgents(): number;
  ask(running: number): void;
  quit(): void;
}

export interface QuitGate {
  shouldQuit(): boolean;
  choose(choice: QuitChoice): void;
  agentsChanged(): void;
}

export function createQuitGate(deps: QuitGateDeps): QuitGate {
  let waiting = false;
  let confirmed = false;

  function quit() {
    waiting = false;
    confirmed = true;
    deps.quit();
  }

  function agentsChanged() {
    if (waiting && !deps.runningAgents()) quit();
  }

  return {
    shouldQuit() {
      const running = deps.runningAgents();
      if (confirmed || !running) return true;
      deps.ask(running);
      return false;
    },
    choose(choice) {
      waiting = choice === 'wait';
      if (choice === 'quit') quit();
      else agentsChanged();
    },
    agentsChanged,
  };
}
