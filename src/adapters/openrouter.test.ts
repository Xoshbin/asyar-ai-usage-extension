import { describe, expect, it, vi } from 'vitest';
import type { INetworkService } from 'asyar-sdk/contracts';
import { openrouterAdapter } from './openrouter';
const fakeNetwork = (response: { status: number; ok: boolean; body: string }) =>
  ({ fetch: vi.fn().mockResolvedValue(response) }) as unknown as INetworkService;
describe('openrouterAdapter', () => {
  it('requires an API key without fetching', async () => {
    const network = fakeNetwork({ status: 200, ok: true, body: '{}' });
    expect(openrouterAdapter.isConfigured({ network, preferences: {} })).toBe(false);
    expect((await openrouterAdapter.fetchSnapshots({ network, preferences: {} }))[0].status).toBe(
      'unconfigured',
    );
    expect(network.fetch).not.toHaveBeenCalled();
  });
  it('maps credits', async () => {
    const network = fakeNetwork({
      status: 200,
      ok: true,
      body: JSON.stringify({ data: { limit_remaining: 37.5 } }),
    });
    expect(
      await openrouterAdapter.fetchSnapshots({
        network,
        preferences: { openrouterApiKey: 'test-key' },
      }),
    ).toEqual([
      {
        sourceId: 'openrouter',
        kind: 'credits',
        status: 'ok',
        label: 'Credits remaining',
        remainingUsd: 37.5,
        isUnofficial: false,
      },
    ]);
  });
  it('maps a rejected key to error', async () => {
    expect(
      (
        await openrouterAdapter.fetchSnapshots({
          network: fakeNetwork({ status: 401, ok: false, body: '' }),
          preferences: { openrouterApiKey: 'bad' },
        })
      )[0].status,
    ).toBe('error');
  });
});
