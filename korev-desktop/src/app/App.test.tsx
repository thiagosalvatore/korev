import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { installFakeBridge, installMatchMedia } from './fake-bridge';
import {
  CONNECTED_AUTH,
  DISCONNECTED_AUTH,
  WATCHING_SETTINGS,
} from './test-fixtures';

beforeEach(() => installMatchMedia());
afterEach(cleanup);

describe('App', () => {
  it('shows the setup pane with Connect when there is no connection', async () => {
    installFakeBridge({ auth: DISCONNECTED_AUTH });
    render(<App />);
    expect(
      await screen.findByRole('button', { name: 'Connect GitHub' }),
    ).toBeTruthy();
  });

  it('offers Try again when the saved sign-in cannot be unlocked', async () => {
    const { bridge } = installFakeBridge({
      auth: { ...DISCONNECTED_AUTH, unlockFailures: 1 },
    });
    render(<App />);

    expect(
      await screen.findByText(
        "Korev couldn't unlock your saved GitHub sign-in",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Connect GitHub' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(bridge.auth.retryUnlock).toHaveBeenCalledOnce();
  });

  it('shows the repo step when connected without repos', async () => {
    installFakeBridge({
      auth: CONNECTED_AUTH,
      settings: { ...WATCHING_SETTINGS, repos: [] },
      suggestedRepos: ['acme/api'],
    });
    render(<App />);
    expect(await screen.findByText('Connected as @octocat')).toBeTruthy();
    expect(
      await screen.findByRole('button', { name: /Open inbox \(1 repo\)/ }),
    ).toBeTruthy();
  });

  it('shows the inbox shell when connected with repos', async () => {
    installFakeBridge({ auth: CONNECTED_AUTH, settings: WATCHING_SETTINGS });
    render(<App />);
    expect(
      await screen.findByRole('navigation', { name: 'My PRs' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Review requests' }),
    ).toBeTruthy();
  });
});
