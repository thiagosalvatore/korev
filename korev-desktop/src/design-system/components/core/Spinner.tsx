import { LoadingRing } from './LoadingRing';

export function Spinner() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="flex min-h-0 flex-1 animate-appear items-center justify-center text-fg-4"
    >
      <LoadingRing size={20} />
    </div>
  );
}
