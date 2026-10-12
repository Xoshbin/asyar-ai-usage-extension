import { describe, expect, it } from 'vitest';
import { compactTrayTitle } from './tray';
import type { CachedSource } from './types';

const cache = (label: string, percentUsed: number): CachedSource => ({
  fetchedAt: 1,
  snapshots: [
    {
      sourceId: 'claude',
      kind: 'quota',
      status: 'ok',
      label,
      percentUsed,
      isUnofficial: true,
    },
  ],
});

describe('compactTrayTitle', () => {
  it('shows the five-hour usage for each provider that has one, without a provider prefix', () => {
    expect(
      compactTrayTitle({
        codex: null,
        claude: {
          fetchedAt: 1,
          snapshots: [
            ...cache('Session limit', 22).snapshots,
            ...cache('Weekly limit', 22).snapshots,
          ],
        },
      }),
    ).toBe('5h 22%');
  });

  it('omits weekly-only windows and returns null without any session quota', () => {
    expect(compactTrayTitle({ claude: cache('Weekly limit', 35) })).toBeNull();
    expect(compactTrayTitle({ openrouter: { fetchedAt: 1, snapshots: [] } })).toBeNull();
  });

  it('shows hourly for both providers when both have a session window', () => {
    expect(
      compactTrayTitle({
        claude: cache('Session limit', 22),
        codex: {
          fetchedAt: 1,
          snapshots: [{ ...cache('5-hour limit', 61).snapshots[0], sourceId: 'codex' }],
        },
      }),
    ).toBe('5h 61% · 5h 22%');
  });
});
