import { cn, Icon } from '../design-system';
import type { RemoteStatus } from '../shared/model';

function remoteLabel({ address, devices }: RemoteStatus): string {
  if (!devices.length)
    return `Remote access is on at ${address}. No device is connected.`;
  return `Connected: ${devices.join(', ')}`;
}

export function RemoteDevices({ remote }: { remote: RemoteStatus }) {
  if (!remote.address) return null;
  const connected = remote.devices.length > 0;
  const label = remoteLabel(remote);
  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      className={cn(
        'flex h-7 flex-none items-center gap-1 px-1.5 text-xs tabular-nums',
        connected ? 'text-success' : 'text-fg-4',
      )}
    >
      <Icon name="smartphone" size={14} />
      {connected ? remote.devices.length : null}
    </span>
  );
}
