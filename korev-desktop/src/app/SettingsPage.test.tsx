import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
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
    explainModel: null,
    loadout: [],
    toolApprovals: false,
    askFollowsToolApprovals: false,
    orchestration: true,
  },
} as unknown as AppState;

describe('Agents settings', () => {
  it('offers model choices for a signed-in agent', () => {
    render(<SettingsPage state={STATE} section="agents" />);

    expect(screen.getByText('Connected')).toBeTruthy();
    expect(screen.getByText('ada@example.com')).toBeTruthy();
    expect(screen.getByLabelText('Claude Code model')).toBeTruthy();
  });

  it('keeps the explain model apart from the review model', () => {
    render(<SettingsPage state={STATE} section="models" />);

    fireEvent.change(screen.getByLabelText('Explain model'), {
      target: { value: 'claude:claude-sonnet-5-5' },
    });

    expect(window.korev.call).toHaveBeenCalledWith('updateSettings', [
      {
        explainModel: {
          agent: 'claude',
          model: 'claude-sonnet-5-5',
          effort: 'high',
        },
      },
    ]);
  });

  it('lets Ask chats follow tool approvals only while approvals are off', () => {
    const { rerender } = render(
      <SettingsPage state={STATE} section="agents" />,
    );
    const row = screen.getByText('Ask chats follow the same behavior')
      .parentElement!.parentElement!;

    fireEvent.click(within(row).getByRole('switch'));

    expect(window.korev.call).toHaveBeenCalledWith('updateSettings', [
      { askFollowsToolApprovals: true },
    ]);

    rerender(
      <SettingsPage
        state={{
          ...STATE,
          settings: { ...STATE.settings, toolApprovals: true },
        }}
        section="agents"
      />,
    );

    expect(screen.queryByText('Ask chats follow the same behavior')).toBeNull();
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

describe('Sound file setting', () => {
  function soundState(notificationSoundFile: string): AppState {
    return {
      ...STATE,
      settings: { ...STATE.settings, notificationSoundFile },
    };
  }

  it('names the chosen file and goes back to the default sound', () => {
    render(
      <SettingsPage
        state={soundState('/Users/dev/Music/ding.mp3')}
        section="general"
      />,
    );

    expect(screen.getByText(/Plays ding\.mp3\./)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Use default' }));

    expect(window.korev.call).toHaveBeenCalledWith('updateSettings', [
      { notificationSoundFile: '' },
    ]);
  });

  it('opens the file picker', () => {
    render(<SettingsPage state={soundState('')} section="general" />);

    expect(screen.queryByRole('button', { name: 'Use default' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Choose…' }));

    expect(window.korev.call).toHaveBeenCalledWith(
      'chooseNotificationSound',
      [],
    );
  });
});

describe('Appearance settings', () => {
  const appearanceState = (accentColor: string) =>
    ({
      ...STATE,
      settings: {
        ...STATE.settings,
        theme: 'dark',
        darkTheme: 'korev',
        lightTheme: 'korev',
        accentColor,
      },
    }) as AppState;

  afterEach(() => {
    vi.useRealTimers();
    document.documentElement.removeAttribute('style');
  });

  it('picks a dark theme preset', () => {
    render(<SettingsPage state={appearanceState('')} section="appearance" />);
    const darkThemes = screen.getByRole('radiogroup', { name: 'Dark theme' });

    expect(
      within(darkThemes)
        .getByRole('radio', { name: 'Korev' })
        .getAttribute('aria-checked'),
    ).toBe('true');
    fireEvent.click(
      within(darkThemes).getByRole('radio', { name: 'Graphite' }),
    );

    expect(window.korev.call).toHaveBeenCalledWith('updateSettings', [
      { darkTheme: 'graphite' },
    ]);
  });

  it('goes back to the theme accent', () => {
    render(
      <SettingsPage state={appearanceState('#d97757')} section="appearance" />,
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Theme default' }));

    expect(window.korev.call).toHaveBeenCalledWith('updateSettings', [
      { accentColor: '' },
    ]);
  });

  it('previews a custom accent at once and saves it when the drag settles', () => {
    vi.useFakeTimers();
    render(<SettingsPage state={appearanceState('')} section="appearance" />);

    fireEvent.input(screen.getByLabelText('Custom color'), {
      target: { value: '#123456' },
    });

    expect(document.documentElement.style.getPropertyValue('--accent')).toBe(
      '#123456',
    );
    expect(window.korev.call).not.toHaveBeenCalledWith('updateSettings', [
      { accentColor: '#123456' },
    ]);
    vi.runAllTimers();
    expect(window.korev.call).toHaveBeenCalledWith('updateSettings', [
      { accentColor: '#123456' },
    ]);
  });
});
