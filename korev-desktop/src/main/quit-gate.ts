import type { QuitChoice } from '../shared/api';

export interface QuitGateDeps {
  runningAgents(): number;
  stayResident(): boolean;
  background(): void;
  ask(running: number): void;
  quit(): void;
}

export interface QuitGate {
  shouldQuit(): boolean;
  requestQuit(): void;
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

  function askOrQuit(): boolean {
    const running = deps.runningAgents();
    if (!running) return true;
    deps.ask(running);
    return false;
  }

  return {
    shouldQuit() {
      if (confirmed) return true;
      if (deps.stayResident()) {
        deps.background();
        return false;
      }
      return askOrQuit();
    },
    requestQuit() {
      if (askOrQuit()) quit();
    },
    choose(choice) {
      waiting = choice === 'wait';
      if (choice === 'quit') quit();
      else agentsChanged();
    },
    agentsChanged,
  };
}
