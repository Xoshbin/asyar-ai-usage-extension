import { describe, expect, it, vi } from 'vitest';
import type { INetworkService } from 'asyar-sdk/contracts';
import { claudeAdapter } from './claude';
const fakeNetwork = (response: { status: number; ok: boolean; body: string }) =>
  ({ fetch: vi.fn().mockResolvedValue(response) }) as unknown as INetworkService;
describe('claudeAdapter', () => {
  it('maps session and weekly windows', async () => {
    const network = fakeNetwork({
      status: 200,
      ok: true,
      body: JSON.stringify({
        five_hour: { utilization: 20, resets_at: 10 },
        seven_day: { utilization: 55, resets_at: 20 },
      }),
    });
    expect(await claudeAdapter.fetchSnapshots({ network, preferences: {} })).toEqual([
      {
        sourceId: 'claude',
        kind: 'quota',
        status: 'ok',
        label: 'Session limit',
        percentUsed: 20,
        resetsAt: 10_000,
        isUnofficial: true,
      },
      {
        sourceId: 'claude',
        kind: 'quota',
        status: 'ok',
        label: 'Weekly limit',
        percentUsed: 55,
        resetsAt: 20_000,
        isUnofficial: true,
      },
    ]);
    expect(network.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        secretRefs: ['claude-token'],
        headers: { 'anthropic-beta': 'oauth-2025-04-20' },
      }),
    );
  });
  it('maps rate limits to error', async () => {
    expect(
      (
        await claudeAdapter.fetchSnapshots({
          network: fakeNetwork({ status: 429, ok: false, body: '' }),
          preferences: {},
        })
      )[0].status,
    ).toBe('error');
  });
  it('maps missing credentials to unconfigured', async () => {
    const network = {
      fetch: vi.fn().mockRejectedValue(new Error('missing')),
    } as unknown as INetworkService;
    expect((await claudeAdapter.fetchSnapshots({ network, preferences: {} }))[0].status).toBe(
      'unconfigured',
    );
  });
  it('normalizes ISO reset timestamps returned by the live endpoint', async () => {
    const network = fakeNetwork({
      status: 200,
      ok: true,
      body: JSON.stringify({ five_hour: { utilization: 22, resets_at: '2026-10-12T12:30:00Z' } }),
    });
    const snapshots = await claudeAdapter.fetchSnapshots({ network, preferences: {} });
    expect(snapshots[0].resetsAt).toBe(Date.parse('2026-10-12T12:30:00Z'));
  });
});
