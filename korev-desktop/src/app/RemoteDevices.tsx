import { cn, Icon } from '../design-system';
import type { RemoteStatus } from '../shared/model';

function remoteLabel({ address, devices, error }: RemoteStatus): string {
  if (error) return `Remote access did not start: ${error}`;
  if (!devices.length)
    return `Remote access is on at ${address}. No device is connected.`;
  return `Connected: ${devices.join(', ')}`;
}

function remoteTone({ devices, error }: RemoteStatus): string {
  if (error) return 'text-danger';
  return devices.length ? 'text-success' : 'text-fg-4';
}

export function RemoteDevices({
  remote,
  onOpen,
}: {
  remote: RemoteStatus;
  onOpen: () => void;
}) {
  if (!remote.address && !remote.error) return null;
  const label = remoteLabel(remote);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onOpen}
      className={cn(
        'flex h-7 flex-none cursor-pointer items-center gap-1 rounded-sm border-0 bg-transparent px-1.5 text-xs tabular-nums hover:bg-hover',
        remoteTone(remote),
      )}
    >
      <Icon name="smartphone" size={14} />
      {remote.devices.length ? remote.devices.length : null}
    </button>
  );
}
