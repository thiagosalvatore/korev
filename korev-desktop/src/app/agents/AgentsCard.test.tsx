import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { AgentPreference, AgentStatus } from '../../shared/agents';
import { DEFAULT_SETTINGS } from '../../shared/settings';
import { installFakeBridge } from '../fake-bridge';
import { AgentsCard } from './AgentsCard';

afterEach(cleanup);

function status(overrides: Partial<AgentStatus>): AgentStatus {
  return {
    provider: 'claude',
    installed: true,
    version: '2.1.288',
    signedIn: true,
    plan: 'Claude Max',
    problem: null,
    ...overrides,
  };
}

const CLAUDE_SIGNED_IN = status({});
const CODEX_SIGNED_OUT = status({
  provider: 'codex',
  signedIn: false,
  plan: null,
});

function renderCard(
  agents: AgentStatus[],
  preference: AgentPreference = DEFAULT_SETTINGS.agent,
) {
  const fake = installFakeBridge({
    agents,
    agentModels: [{ id: 'claude-opus-5-5', label: 'Opus 5.5' }],
  });
  render(<AgentsCard preference={preference} />);
  return fake;
}

describe('AgentsCard', () => {
  it('links to the install page of an agent that is not installed', async () => {
    const { bridge } = renderCard([
      status({ installed: false, version: null, signedIn: false, plan: null }),
    ]);

    fireEvent.click(await screen.findByRole('button', { name: 'Install' }));

    expect(screen.getByText('Not installed')).toBeTruthy();
    expect(bridge.shell.openAgentInstall).toHaveBeenCalledWith('claude');
  });

  it('signs in to Codex from Korev', async () => {
    const { bridge } = renderCard([CLAUDE_SIGNED_IN, CODEX_SIGNED_OUT]);

    fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }));

    expect(bridge.agents.signIn).toHaveBeenCalledWith('codex');
  });

  it('shows the terminal command for a signed-out Claude Code', async () => {
    renderCard([status({ signedIn: false, plan: null })]);

    expect(await screen.findByText('claude auth login')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
  });

  it('saves the chosen agent and model', async () => {
    const { bridge } = renderCard([CLAUDE_SIGNED_IN], {
      provider: 'claude',
      models: {},
    });

    fireEvent.click(await screen.findByRole('tab', { name: 'Claude Code' }));
    await screen.findByRole('option', { name: 'Opus 5.5' });
    fireEvent.change(screen.getByLabelText('Model'), {
      target: { value: 'claude-opus-5-5' },
    });

    expect(bridge.settings.setAgent).toHaveBeenCalledWith({
      provider: 'claude',
      models: {},
    });
    expect(bridge.settings.setAgent).toHaveBeenLastCalledWith({
      provider: 'claude',
      models: { claude: 'claude-opus-5-5' },
    });
  });

  it('shows what the agent replied to the test prompt', async () => {
    const { bridge } = renderCard([CLAUDE_SIGNED_IN]);

    fireEvent.click(await screen.findByRole('button', { name: 'Test' }));

    expect(await screen.findByText(/The agent replied “OK”/)).toBeTruthy();
    expect(bridge.agents.test).toHaveBeenCalledWith('claude');
  });
});
