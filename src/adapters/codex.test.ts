import { describe, expect, it, vi } from 'vitest';
import type { INetworkService } from 'asyar-sdk/contracts';
import { codexAdapter } from './codex';
const fakeNetwork = (response: { status: number; ok: boolean; body: string }) =>
  ({ fetch: vi.fn().mockResolvedValue(response) }) as unknown as INetworkService;
describe('codexAdapter', () => {
  it('maps successful windows', async () => {
    const network = fakeNetwork({
      status: 200,
      ok: true,
      body: JSON.stringify({
        five_hour: { usage_percent: 42, reset_at: 10 },
        weekly: { usage_percent: 12, reset_at: 20 },
      }),
    });
    expect(await codexAdapter.fetchSnapshots({ network, preferences: {} })).toEqual([
      {
        sourceId: 'codex',
        kind: 'quota',
        status: 'ok',
        label: '5-hour limit',
        percentUsed: 42,
        resetsAt: 10_000,
        isUnofficial: true,
      },
      {
        sourceId: 'codex',
        kind: 'quota',
        status: 'ok',
        label: 'Weekly limit',
        percentUsed: 12,
        resetsAt: 20_000,
        isUnofficial: true,
      },
    ]);
    expect(network.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ secretRefs: ['codex-token', 'codex-account-id'] }),
    );
  });
  it('maps the live nested Codex rate-limit response', async () => {
    const network = fakeNetwork({
      status: 200,
      ok: true,
      body: JSON.stringify({
        rate_limit: {
          primary_window: { used_percent: 22, reset_at: 1_700_000_000 },
          secondary_window: { used_percent: 8, reset_at: 1_700_600_000 },
        },
      }),
    });

    expect(await codexAdapter.fetchSnapshots({ network, preferences: {} })).toEqual([
      {
        sourceId: 'codex',
        kind: 'quota',
        status: 'ok',
        label: '5-hour limit',
        percentUsed: 22,
        resetsAt: 1_700_000_000_000,
        isUnofficial: true,
      },
      {
        sourceId: 'codex',
        kind: 'quota',
        status: 'ok',
        label: 'Weekly limit',
        percentUsed: 8,
        resetsAt: 1_700_600_000_000,
        isUnofficial: true,
      },
    ]);
  });
  it('shows only 5-hour card when secondary_window is null', async () => {
    // The live API returns secondary_window: null (not undefined) when only one
    // rate-limit window is active. null is nullish so ?? falls through to
    // data.weekly (undefined), and no weekly card is added.
    const network = fakeNetwork({
      status: 200,
      ok: true,
      body: JSON.stringify({
        plan_type: 'pro',
        rate_limit: {
          allowed: true,
          limit_reached: false,
          primary_window: { used_percent: 55, reset_at: 1_700_000_000 },
          secondary_window: null,
        },
        credits: { has_credits: false, unlimited: true, balance: '0' },
      }),
    });
    const snapshots = await codexAdapter.fetchSnapshots({ network, preferences: {} });
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      sourceId: 'codex',
      kind: 'quota',
      status: 'ok',
      label: '5-hour limit',
      percentUsed: 55,
      resetsAt: 1_700_000_000_000,
    });
  });

  it('reports an error instead of leaving the provider blank for an unknown success shape', async () => {
    const snapshots = await codexAdapter.fetchSnapshots({
      network: fakeNetwork({ status: 200, ok: true, body: JSON.stringify({ plan_type: 'plus' }) }),
      preferences: {},
    });

    expect(snapshots).toEqual([expect.objectContaining({ sourceId: 'codex', status: 'error' })]);
  });
  it('maps missing or expired login to unconfigured', async () => {
    expect(
      (
        await codexAdapter.fetchSnapshots({
          network: fakeNetwork({ status: 401, ok: false, body: '' }),
          preferences: {},
        })
      )[0].status,
    ).toBe('unconfigured');
    const network = {
      fetch: vi.fn().mockRejectedValue(new Error('missing')),
    } as unknown as INetworkService;
    expect((await codexAdapter.fetchSnapshots({ network, preferences: {} }))[0].status).toBe(
      'unconfigured',
    );
  });
  it('maps server and malformed responses to errors', async () => {
    expect(
      (
        await codexAdapter.fetchSnapshots({
          network: fakeNetwork({ status: 500, ok: false, body: '' }),
          preferences: {},
        })
      )[0].status,
    ).toBe('error');
    expect(
      (
        await codexAdapter.fetchSnapshots({
          network: fakeNetwork({ status: 200, ok: true, body: '?' }),
          preferences: {},
        })
      )[0].status,
    ).toBe('error');
  });
  it('normalizes second epoch reset timestamps', async () => {
    const network = fakeNetwork({
      status: 200,
      ok: true,
      body: JSON.stringify({ five_hour: { usage_percent: 42, reset_at: 1_700_000_000 } }),
    });
    const snapshots = await codexAdapter.fetchSnapshots({ network, preferences: {} });
    expect(snapshots[0].resetsAt).toBe(1_700_000_000_000);
  });
});
