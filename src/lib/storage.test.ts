import { beforeEach, describe, expect, it } from 'vitest';
import type { IStorageService } from 'asyar-sdk/contracts';
import {
  loadBackoff,
  loadCache,
  loadNotifiedLabel,
  saveBackoff,
  saveCache,
  saveNotifiedLabel,
} from './storage';
import { resetBackoff } from './backoff';

function fakeStorage(): IStorageService {
  const map = new Map<string, string>();
  return {
    get: async (key: string) => map.get(key) ?? null,
    set: async (key: string, value: string) => {
      map.set(key, value);
    },
    delete: async (key: string) => {
      map.delete(key);
    },
  } as unknown as IStorageService;
}

describe('storage', () => {
  let storage: IStorageService;
  beforeEach(() => {
    storage = fakeStorage();
  });
  it('returns defaults for missing values', async () => {
    expect(await loadCache(storage, 'codex')).toBeNull();
    expect(await loadBackoff(storage, 'claude')).toEqual(resetBackoff());
    expect(await loadNotifiedLabel(storage, 'codex')).toBeNull();
  });
  it('round-trips cache, backoff, and notification state', async () => {
    const cache = { snapshots: [], fetchedAt: 123 };
    const backoff = { consecutiveFailures: 2, nextAllowedAt: 999 };
    await saveCache(storage, 'codex', cache);
    await saveBackoff(storage, 'claude', backoff);
    await saveNotifiedLabel(storage, 'codex', '5-hour limit');
    expect(await loadCache(storage, 'codex')).toEqual(cache);
    expect(await loadBackoff(storage, 'claude')).toEqual(backoff);
    expect(await loadNotifiedLabel(storage, 'codex')).toBe('5-hour limit');
  });
  it('isolates cache keys by source', async () => {
    await saveCache(storage, 'codex', { snapshots: [], fetchedAt: 1 });
    expect(await loadCache(storage, 'claude')).toBeNull();
  });
});
