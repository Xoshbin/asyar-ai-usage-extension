import type { UsageSnapshot } from './types';
function remaining(snapshot: UsageSnapshot): number | null {
  return snapshot.status === 'ok' &&
    snapshot.kind === 'quota' &&
    typeof snapshot.percentUsed === 'number'
    ? 100 - snapshot.percentUsed
    : null;
}
export function shouldNotify(
  snapshot: UsageSnapshot,
  threshold: number,
  lastLabel: string | null,
): boolean {
  const value = remaining(snapshot);
  return value !== null && value < threshold && lastLabel !== snapshot.label;
}
export function labelAfterSnapshot(
  snapshot: UsageSnapshot,
  threshold: number,
  lastLabel: string | null,
): string | null {
  const value = remaining(snapshot);
  if (value === null || value >= threshold) return null;
  return lastLabel === snapshot.label ? lastLabel : snapshot.label;
}
