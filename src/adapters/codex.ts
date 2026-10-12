import type { AdapterDeps, UsageAdapter } from '../lib/adapter';
import type { UsageSnapshot } from '../lib/types';
import { normalizeTimestamp } from '../lib/time';
const URL = 'https://chatgpt.com/backend-api/wham/usage';
const unavailable = (message: string): UsageSnapshot[] => [
  {
    sourceId: 'codex',
    kind: 'quota',
    status: 'unconfigured',
    label: 'Codex',
    message,
    isUnofficial: true,
  },
];
const unexpectedResponse = (): UsageSnapshot[] => [
  {
    sourceId: 'codex',
    kind: 'quota',
    status: 'error',
    label: 'Codex',
    message: 'Codex returned an unexpected response.',
    isUnofficial: true,
  },
];

interface CodexWindow {
  usage_percent?: number;
  used_percent?: number;
  reset_at?: unknown;
}

export const codexAdapter: UsageAdapter = {
  id: 'codex',
  isConfigured: () => true,
  async fetchSnapshots({ network }: AdapterDeps) {
    let response;
    try {
      response = await network.fetch(URL, {
        secretRefs: ['codex-token', 'codex-account-id'],
        timeout: 10_000,
      });
    } catch {
      return unavailable(
        'Codex CLI not found — install it and run `codex login` to see this quota.',
      );
    }
    if (response.status === 401)
      return unavailable('Your Codex CLI login expired — run `codex login` again.');
    if (!response.ok)
      return [
        {
          sourceId: 'codex',
          kind: 'quota',
          status: 'error',
          label: 'Codex',
          message: `Codex returned HTTP ${response.status}.`,
          isUnofficial: true,
        },
      ];
    let data: {
      five_hour?: CodexWindow;
      weekly?: CodexWindow;
      rate_limit?: {
        primary_window?: CodexWindow;
        secondary_window?: CodexWindow;
      };
    };
    try {
      data = JSON.parse(response.body);
    } catch {
      return unexpectedResponse();
    }
    const session = data.rate_limit?.primary_window ?? data.five_hour;
    const weekly = data.rate_limit?.secondary_window ?? data.weekly;
    const snapshots: UsageSnapshot[] = [];
    if (session)
      snapshots.push({
        sourceId: 'codex',
        kind: 'quota',
        status: 'ok',
        label: '5-hour limit',
        percentUsed: session.used_percent ?? session.usage_percent,
        resetsAt: normalizeTimestamp(session.reset_at),
        isUnofficial: true,
      });
    if (weekly)
      snapshots.push({
        sourceId: 'codex',
        kind: 'quota',
        status: 'ok',
        label: 'Weekly limit',
        percentUsed: weekly.used_percent ?? weekly.usage_percent,
        resetsAt: normalizeTimestamp(weekly.reset_at),
        isUnofficial: true,
      });
    return snapshots.length > 0 ? snapshots : unexpectedResponse();
  },
};
