import type { AdapterDeps, UsageAdapter } from '../lib/adapter';
const URL = 'https://openrouter.ai/api/v1/key';
export const openrouterAdapter: UsageAdapter = {
  id: 'openrouter',
  isConfigured: ({ preferences }) => Boolean(preferences.openrouterApiKey),
  async fetchSnapshots({ network, preferences }: AdapterDeps) {
    const key = preferences.openrouterApiKey as string | undefined;
    if (!key)
      return [
        {
          sourceId: 'openrouter',
          kind: 'credits',
          status: 'unconfigured',
          label: 'OpenRouter',
          message: 'Add your OpenRouter API key in preferences to see credits.',
          isUnofficial: false,
        },
      ];
    let response;
    try {
      response = await network.fetch(URL, {
        headers: { Authorization: `Bearer ${key}` },
        timeout: 10_000,
      });
    } catch {
      return [
        {
          sourceId: 'openrouter',
          kind: 'credits',
          status: 'error',
          label: 'OpenRouter',
          message: 'OpenRouter could not be reached.',
          isUnofficial: false,
        },
      ];
    }
    if (!response.ok)
      return [
        {
          sourceId: 'openrouter',
          kind: 'credits',
          status: 'error',
          label: 'OpenRouter',
          message: `OpenRouter returned HTTP ${response.status}.`,
          isUnofficial: false,
        },
      ];
    try {
      const parsed = JSON.parse(response.body) as { data?: { limit_remaining?: number } };
      return [
        {
          sourceId: 'openrouter',
          kind: 'credits',
          status: 'ok',
          label: 'Credits remaining',
          remainingUsd: parsed.data?.limit_remaining,
          isUnofficial: false,
        },
      ];
    } catch {
      return [
        {
          sourceId: 'openrouter',
          kind: 'credits',
          status: 'error',
          label: 'OpenRouter',
          message: 'OpenRouter returned an unexpected response.',
          isUnofficial: false,
        },
      ];
    }
  },
};
