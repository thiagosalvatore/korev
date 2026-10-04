import { Badge } from '../../design-system';
import type { Reason } from '../../shared/inbox';

export function ReasonChips({ reasons }: { reasons: Reason[] }) {
  const [primary, ...rest] = reasons;
  if (!primary) return <span />;
  return (
    <span
      title={reasons.map((reason) => reason.label).join(' · ')}
      className="flex items-center justify-end gap-1.5"
    >
      <Badge tone={primary.severity}>{primary.label}</Badge>
      {rest.length > 0 ? <Badge>+{rest.length}</Badge> : null}
    </span>
  );
}
