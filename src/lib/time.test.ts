import { describe, expect, it } from 'vitest';
import { normalizeCachedSource, normalizeTimestamp } from './time';

describe('normalizeTimestamp', () => {
  it('keeps millisecond epoch timestamps unchanged', () => {
    expect(normalizeTimestamp(1_700_000_000_000)).toBe(1_700_000_000_000);
  });

  it('converts second epoch timestamps to milliseconds', () => {
    expect(normalizeTimestamp(1_700_000_000)).toBe(1_700_000_000_000);
  });

  it('parses ISO 8601 timestamps', () => {
    expect(normalizeTimestamp('2026-10-12T12:30:00Z')).toBe(Date.parse('2026-10-12T12:30:00Z'));
  });

  it('returns null for missing or invalid timestamps', () => {
    expect(normalizeTimestamp(undefined)).toBeNull();
    expect(normalizeTimestamp('not-a-date')).toBeNull();
  });

  it('repairs string reset timestamps in an existing cache', () => {
    const cache = normalizeCachedSource({
      fetchedAt: 1,
      snapshots: [
        {
          sourceId: 'claude',
          kind: 'quota',
          status: 'ok',
          label: 'Session limit',
          percentUsed: 22,
          resetsAt: '2026-10-12T12:30:00Z',
          isUnofficial: true,
        },
      ],
    } as never);

    expect(cache.snapshots[0].resetsAt).toBe(Date.parse('2026-10-12T12:30:00Z'));
  });
});
