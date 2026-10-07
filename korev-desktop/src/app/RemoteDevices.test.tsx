import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RemoteDevices } from './RemoteDevices';

afterEach(cleanup);

const ADDRESS = '100.101.102.103:7420';

describe('RemoteDevices', () => {
  it('shows nothing while remote access is off', () => {
    render(<RemoteDevices remote={{ address: null, devices: [] }} />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('says remote access is on when no device is connected', () => {
    render(<RemoteDevices remote={{ address: ADDRESS, devices: [] }} />);
    expect(screen.getByRole('status').getAttribute('aria-label')).toBe(
      `Remote access is on at ${ADDRESS}. No device is connected.`,
    );
  });

  it('names the connected devices', () => {
    render(
      <RemoteDevices
        remote={{ address: ADDRESS, devices: ['iPhone', 'iPad'] }}
      />,
    );
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-label')).toBe('Connected: iPhone, iPad');
    expect(status.textContent).toBe('2');
  });
});
