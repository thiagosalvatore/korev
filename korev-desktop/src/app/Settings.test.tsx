import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { installFakeBridge } from './fake-bridge';
import { SettingsPage } from './Settings';
import {
  CONNECTED_AUTH,
  WATCHING_SETTINGS,
  makeSnapshot,
} from './test-fixtures';

afterEach(cleanup);

function openSection(name: string) {
  fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Settings' })).getByRole(
      'button',
      { name },
    ),
  );
}

describe('Settings sections', () => {
  it('shows only the section picked in the Settings nav', () => {
    installFakeBridge();
    render(
      <SettingsPage
        auth={CONNECTED_AUTH}
        settings={WATCHING_SETTINGS}
        snapshot={makeSnapshot()}
      />,
    );

    openSection('AI agents');

    expect(screen.getByText(/Korev runs AI tasks/)).toBeTruthy();
    expect(screen.queryByLabelText('acme/api')).toBeNull();
  });
});

describe('SettingsPage', () => {
  it('stops watching an unchecked repo and restores it on Undo', async () => {
    const { bridge } = installFakeBridge();
    render(
      <SettingsPage
        auth={CONNECTED_AUTH}
        settings={WATCHING_SETTINGS}
        snapshot={makeSnapshot()}
      />,
    );
    openSection('Repositories');

    fireEvent.click(screen.getByLabelText('acme/api'));

    expect(bridge.settings.setRepos).toHaveBeenLastCalledWith(['acme/web']);
    expect(screen.getByText('Stopped watching acme/api')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(bridge.settings.setRepos).toHaveBeenLastCalledWith(
      WATCHING_SETTINGS.repos,
    );
    expect(screen.queryByText('Stopped watching acme/api')).toBeNull();
  });
});

describe('Inbox order', () => {
  it('moves a repo up with ⌥↑, saves the order and announces the move', () => {
    const { bridge } = installFakeBridge();
    render(
      <SettingsPage
        auth={CONNECTED_AUTH}
        settings={WATCHING_SETTINGS}
        snapshot={makeSnapshot()}
      />,
    );
    openSection('Repositories');

    const handle = screen.getByRole('button', {
      name: 'Reorder acme/web, 2 of 2',
    });
    fireEvent.keyDown(handle, { key: 'ArrowUp', altKey: true });

    expect(bridge.settings.setRepos).toHaveBeenLastCalledWith([
      'acme/web',
      'acme/api',
    ]);
    expect(screen.getByText('Moved acme/web to 1 of 2')).toBeTruthy();
  });
});

describe('Merge with', () => {
  it('saves the queue a repo merges with, and shows a detected GitHub queue as fixed', () => {
    const { bridge } = installFakeBridge();
    render(
      <SettingsPage
        auth={CONNECTED_AUTH}
        settings={WATCHING_SETTINGS}
        snapshot={makeSnapshot({
          repoMerge: {
            'acme/web': {
              defaultMethod: 'squash',
              allowedMethods: ['squash'],
              hasMergeQueue: true,
            },
          },
        })}
      />,
    );
    openSection('Repositories');

    fireEvent.change(screen.getByLabelText('Merge acme/api with'), {
      target: { value: 'trunk' },
    });

    expect(bridge.settings.setMergeWith).toHaveBeenCalledWith(
      'acme/api',
      'trunk',
    );
    const web = screen.getByLabelText(
      'Merge acme/web with',
    ) as HTMLSelectElement;
    expect(web.disabled).toBe(true);
    expect(web.selectedOptions[0].textContent).toBe(
      'GitHub merge queue · detected',
    );
  });
});
