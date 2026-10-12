import type { CachedSource } from './types';

export function normalizeTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 100_000_000_000 ? value * 1_000 : value;
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function normalizeCachedSource(cache: CachedSource): CachedSource {
  return {
    ...cache,
    snapshots: cache.snapshots.map((snapshot) => ({
      ...snapshot,
      resetsAt:
        snapshot.resetsAt === undefined
          ? undefined
          : normalizeTimestamp(snapshot.resetsAt as unknown),
    })),
  };
}
