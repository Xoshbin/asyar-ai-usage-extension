import type { AdapterDeps, UsageAdapter } from '../lib/adapter';
import type { UsageSnapshot } from '../lib/types';
import { normalizeTimestamp } from '../lib/time';
const URL = 'https://api.anthropic.com/api/oauth/usage';
const unavailable = (message: string): UsageSnapshot[] => [
  {
    sourceId: 'claude',
    kind: 'quota',
    status: 'unconfigured',
    label: 'Claude',
    message,
    isUnofficial: true,
  },
];
export const claudeAdapter: UsageAdapter = {
  id: 'claude',
  isConfigured: () => true,
  async fetchSnapshots({ network }: AdapterDeps) {
    let response;
    try {
      response = await network.fetch(URL, {
        secretRefs: ['claude-token'],
        headers: { 'anthropic-beta': 'oauth-2025-04-20' },
        timeout: 10_000,
      });
    } catch {
      return unavailable('Claude Code login not found — install it and sign in to see this quota.');
    }
    if (response.status === 401)
      return unavailable('Your Claude Code login expired — sign in again.');
    if (!response.ok)
      return [
        {
          sourceId: 'claude',
          kind: 'quota',
          status: 'error',
          label: 'Claude',
          message: `Claude returned HTTP ${response.status}.`,
          isUnofficial: true,
        },
      ];
    let data: {
      five_hour?: { utilization?: number; resets_at?: unknown };
      seven_day?: { utilization?: number; resets_at?: unknown };
    };
    try {
      data = JSON.parse(response.body);
    } catch {
      return [
        {
          sourceId: 'claude',
          kind: 'quota',
          status: 'error',
          label: 'Claude',
          message: 'Claude returned an unexpected response.',
          isUnofficial: true,
        },
      ];
    }
    const snapshots: UsageSnapshot[] = [];
    if (data.five_hour)
      snapshots.push({
        sourceId: 'claude',
        kind: 'quota',
        status: 'ok',
        label: 'Session limit',
        percentUsed: data.five_hour.utilization,
        resetsAt: normalizeTimestamp(data.five_hour.resets_at),
        isUnofficial: true,
      });
    if (data.seven_day)
      snapshots.push({
        sourceId: 'claude',
        kind: 'quota',
        status: 'ok',
        label: 'Weekly limit',
        percentUsed: data.seven_day.utilization,
        resetsAt: normalizeTimestamp(data.seven_day.resets_at),
        isUnofficial: true,
      });
    return snapshots;
  },
};
