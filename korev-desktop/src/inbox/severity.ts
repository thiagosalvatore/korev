import type { Bucket, Reason, ReasonSeverity } from '../shared/inbox';

export const BUCKET_ORDER: readonly Bucket[] = [
  'needs-you',
  'korev-working',
  'in-progress',
  'ready',
  'stale',
  'kept',
];

export const SECTION_ORDER: readonly Bucket[] = [
  'needs-you',
  'korev-working',
  'ready',
  'in-progress',
  'stale',
  'kept',
];

const SEVERITY_ORDER: readonly ReasonSeverity[] = [
  'danger',
  'warning',
  'neutral',
  'success',
];

export function severityRank(severity: ReasonSeverity): number {
  return SEVERITY_ORDER.indexOf(severity);
}

export function bucketRank(bucket: Bucket): number {
  return BUCKET_ORDER.indexOf(bucket);
}

export function topSeverityRank(reasons: Reason[]): number {
  if (reasons.length === 0) return SEVERITY_ORDER.length;
  return severityRank(reasons[0].severity);
}
