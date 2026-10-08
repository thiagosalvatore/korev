import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLAUDE_MODELS, type AppState } from '../shared/model';
import { SettingsPage } from './SettingsPage';
import { resetUiForTests } from './ui-store';
import { Toaster } from './ui/toast';

afterEach(() => {
  cleanup();
  resetUiForTests();
});

beforeEach(() => {
  window.korev = {
    call: vi.fn(async () => null),
    on: () => () => {},
  } as unknown as Window['korev'];
});

const STATE = {
  repos: [],
  agents: [
    {
      agent: 'claude',
      version: '2.1.0',
      account: {
        method: 'claude.ai',
        email: 'ada@example.com',
        organization: null,
      },
      models: CLAUDE_MODELS,
    },
    { agent: 'codex', version: null, account: null, models: [] },
  ],
  settings: {
    defaultAgent: 'claude',
    defaultModels: { claude: CLAUDE_MODELS[0].id, codex: '' },
    defaultEffort: { claude: 'high', codex: 'medium' },
    reviewModel: null,
    loadout: [],
    toolApprovals: false,
  },
} as unknown as AppState;

describe('Agents settings', () => {
  it('offers model choices for a signed-in agent', () => {
    render(<SettingsPage state={STATE} section="agents" />);

    expect(screen.getByText('Connected')).toBeTruthy();
    expect(screen.getByText('ada@example.com')).toBeTruthy();
    expect(screen.getByLabelText('Claude Code model')).toBeTruthy();
  });

  it('offers no model choices for an agent that is not installed', () => {
    render(<SettingsPage state={STATE} section="agents" />);

    fireEvent.click(screen.getByRole('tab', { name: 'Codex' }));

    expect(screen.getByText('Not installed')).toBeTruthy();
    expect(screen.queryByLabelText('Codex model')).toBeNull();
  });
});

describe('Remote settings', () => {
  const ADDRESS = '100.101.102.103:7420';

  function remoteState(devices: string[]): AppState {
    return {
      ...STATE,
      settings: { ...STATE.settings, remoteAccess: true, remotePort: 7420 },
      remote: { address: ADDRESS, devices, loginUrl: null, error: null },
    };
  }

  function renderRemote(devices: string[]) {
    return (
      <>
        <SettingsPage state={remoteState(devices)} section="remote" />
        <Toaster />
      </>
    );
  }

  it('closes the pairing code and says which device connected', async () => {
    window.korev.call = vi.fn(async () => ({
      url: `http://${ADDRESS}`,
      token: 'secret',
    })) as Window['korev']['call'];
    const { rerender } = render(renderRemote([]));

    fireEvent.click(screen.getByRole('button', { name: 'Show code' }));
    await screen.findByRole('dialog', { name: 'Pair a device' });

    rerender(renderRemote(['iPhone']));

    expect(screen.queryByRole('dialog', { name: 'Pair a device' })).toBeNull();
    expect(screen.getByText('iPhone connected')).toBeTruthy();
  });
});
