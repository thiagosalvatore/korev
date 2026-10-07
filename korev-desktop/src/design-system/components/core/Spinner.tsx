import { Icon } from './Icon';

export function Spinner() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="flex min-h-0 flex-1 items-center justify-center text-fg-4"
    >
      <Icon name="loader-circle" size={18} className="animate-spin" />
    </div>
  );
}
