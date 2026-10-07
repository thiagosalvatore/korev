import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RemoteStatus } from '../shared/model';
import { RemoteDevices } from './RemoteDevices';

afterEach(cleanup);

const ADDRESS = '100.101.102.103:7420';
const OFF: RemoteStatus = {
  address: null,
  devices: [],
  onTailnet: false,
  error: null,
};

function renderStatus(remote: Partial<RemoteStatus>, onOpen = vi.fn()) {
  render(<RemoteDevices remote={{ ...OFF, ...remote }} onOpen={onOpen} />);
  return screen.queryByRole('button');
}

describe('RemoteDevices', () => {
  it('shows nothing while remote access is off', () => {
    expect(renderStatus({})).toBeNull();
  });

  it('says remote access is on when no device is connected', () => {
    expect(renderStatus({ address: ADDRESS })?.getAttribute('aria-label')).toBe(
      `Remote access is on at ${ADDRESS}. No device is connected.`,
    );
  });

  it('names the connected devices and opens remote settings', () => {
    const onOpen = vi.fn();
    const button = renderStatus(
      { address: ADDRESS, devices: ['iPhone', 'iPad'] },
      onOpen,
    )!;
    expect(button.getAttribute('aria-label')).toBe('Connected: iPhone, iPad');
    expect(button.textContent).toBe('2');
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalled();
  });

  it('says why remote access did not start', () => {
    expect(
      renderStatus({ error: 'listen EADDRINUSE' })?.getAttribute('aria-label'),
    ).toBe('Remote access did not start: listen EADDRINUSE');
  });
});
