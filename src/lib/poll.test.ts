import { describe, expect, it, vi } from 'vitest';
import type { IStorageService } from 'asyar-sdk/contracts';
import type { UsageAdapter } from './adapter';
import { runPollCycle } from './poll';
function storage(): IStorageService {
  const values = new Map<string, string>();
  return {
    get: async (key: string) => values.get(key) ?? null,
    set: async (key: string, value: string) => {
      values.set(key, value);
    },
    delete: async (key: string) => {
      values.delete(key);
    },
  } as unknown as IStorageService;
}
describe('runPollCycle', () => {
  it('skips unconfigured sources', async () => {
    const adapter: UsageAdapter = {
      id: 'openrouter',
      isConfigured: () => false,
      fetchSnapshots: vi.fn(),
    };
    const result = await runPollCycle({
      adapters: [adapter],
      storage: storage(),
      network: {} as never,
      feedback: {} as never,
      preferences: {},
      now: 0,
    });
    expect(result.anyAttempted).toBe(false);
    expect(adapter.fetchSnapshots).not.toHaveBeenCalled();
  });
  it('caches success and backs off complete failure', async () => {
    const ok: UsageAdapter = {
      id: 'codex',
      isConfigured: () => true,
      fetchSnapshots: vi.fn().mockResolvedValue([
        {
          sourceId: 'codex',
          kind: 'quota',
          status: 'ok',
          label: 'Window',
          percentUsed: 10,
          isUnofficial: true,
        },
      ]),
    };
    const store = storage();
    expect(
      (
        await runPollCycle({
          adapters: [ok],
          storage: store,
          network: {} as never,
          feedback: {} as never,
          preferences: {},
          now: 1000,
        })
      ).cachesBySource.codex?.fetchedAt,
    ).toBe(1000);
    const bad: UsageAdapter = {
      id: 'claude',
      isConfigured: () => true,
      fetchSnapshots: vi.fn().mockResolvedValue([
        {
          sourceId: 'claude',
          kind: 'quota',
          status: 'error',
          label: 'Claude',
          isUnofficial: true,
        },
      ]),
    };
    await runPollCycle({
      adapters: [bad],
      storage: store,
      network: {} as never,
      feedback: {} as never,
      preferences: {},
      now: 1000,
    });
    expect(
      JSON.parse((await store.get('source:claude:backoff')) as string).consecutiveFailures,
    ).toBe(1);
  });
  it('deduplicates low quota notifications', async () => {
    const adapter: UsageAdapter = {
      id: 'codex',
      isConfigured: () => true,
      fetchSnapshots: vi.fn().mockResolvedValue([
        {
          sourceId: 'codex',
          kind: 'quota',
          status: 'ok',
          label: 'Window',
          percentUsed: 95,
          isUnofficial: true,
        },
      ]),
    };
    const feedback = { sendBackground: vi.fn() };
    const store = storage();
    const deps = {
      adapters: [adapter],
      storage: store,
      network: {} as never,
      feedback: feedback as never,
      preferences: { notifyOnLowQuota: true, notifyThresholdPercent: 10 },
      now: 1000,
    };
    await runPollCycle(deps);
    await runPollCycle({ ...deps, now: 2000 });
    expect(feedback.sendBackground).toHaveBeenCalledTimes(1);
  });
});
