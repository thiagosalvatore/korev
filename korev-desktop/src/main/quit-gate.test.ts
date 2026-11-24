import { describe, expect, it, vi } from 'vitest';
import { createQuitGate } from './quit-gate';

function gateWith(running: number, resident = false) {
  const agents = { running };
  const ask = vi.fn();
  const quit = vi.fn();
  const background = vi.fn();
  const gate = createQuitGate({
    runningAgents: () => agents.running,
    stayResident: () => resident,
    background,
    ask,
    quit,
  });
  return { agents, ask, quit, background, gate };
}

describe('createQuitGate', () => {
  it('quits without asking when no agent is running', () => {
    const { ask, gate } = gateWith(0);
    expect(gate.shouldQuit()).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });

  it('asks before quitting, then quits when the user chooses to quit now', () => {
    const { ask, quit, gate } = gateWith(2);
    expect(gate.shouldQuit()).toBe(false);
    expect(ask).toHaveBeenCalledWith(2);
    gate.choose('quit');
    expect(quit).toHaveBeenCalledOnce();
    expect(gate.shouldQuit()).toBe(true);
  });

  it('waits for the running agents to finish, then quits once', () => {
    const { agents, quit, gate } = gateWith(1);
    gate.shouldQuit();
    gate.choose('wait');
    gate.agentsChanged();
    expect(quit).not.toHaveBeenCalled();
    agents.running = 0;
    gate.agentsChanged();
    gate.agentsChanged();
    expect(quit).toHaveBeenCalledOnce();
  });

  it('stops waiting when the user cancels', () => {
    const { agents, quit, gate } = gateWith(1);
    gate.shouldQuit();
    gate.choose('wait');
    gate.choose('cancel');
    agents.running = 0;
    gate.agentsChanged();
    expect(quit).not.toHaveBeenCalled();
  });

  it('goes to the background instead of asking when it stays resident', () => {
    const { ask, background, gate } = gateWith(2, true);
    expect(gate.shouldQuit()).toBe(false);
    expect(background).toHaveBeenCalledOnce();
    expect(ask).not.toHaveBeenCalled();
  });

  it('asks on an explicit quit while agents run, even when it stays resident', () => {
    const { ask, quit, background, gate } = gateWith(1, true);
    gate.requestQuit();
    expect(ask).toHaveBeenCalledWith(1);
    gate.choose('quit');
    expect(quit).toHaveBeenCalledOnce();
    expect(gate.shouldQuit()).toBe(true);
    expect(background).not.toHaveBeenCalled();
  });

  it('quits at once on an explicit quit when no agent runs', () => {
    const { ask, quit, gate } = gateWith(0, true);
    gate.requestQuit();
    expect(ask).not.toHaveBeenCalled();
    expect(quit).toHaveBeenCalledOnce();
    expect(gate.shouldQuit()).toBe(true);
  });
});
