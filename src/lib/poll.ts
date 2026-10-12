import type { IFeedbackService, INetworkService, IStorageService } from 'asyar-sdk/contracts';
import type { UsageAdapter } from './adapter';
import type { CachedSource, SourceId, UsageSnapshot } from './types';
import { isBackedOff, nextBackoff, resetBackoff } from './backoff';
import {
  loadBackoff,
  loadCache,
  loadNotifiedLabel,
  saveBackoff,
  saveCache,
  saveNotifiedLabel,
} from './storage';
import { labelAfterSnapshot, shouldNotify } from './notify';

export interface PollDeps {
  adapters: UsageAdapter[];
  storage: IStorageService;
  network: INetworkService;
  feedback: IFeedbackService;
  preferences: Record<string, unknown>;
  now: number;
}
export interface PollResult {
  cachesBySource: Partial<Record<SourceId, CachedSource | null>>;
  anyAttempted: boolean;
}

export async function runPollCycle(deps: PollDeps): Promise<PollResult> {
  const cachesBySource: PollResult['cachesBySource'] = {};
  let anyAttempted = false;
  for (const adapter of deps.adapters) {
    if (!adapter.isConfigured({ network: deps.network, preferences: deps.preferences })) {
      cachesBySource[adapter.id] = await loadCache(deps.storage, adapter.id);
      continue;
    }
    const backoff = await loadBackoff(deps.storage, adapter.id);
    if (isBackedOff(backoff, deps.now)) {
      cachesBySource[adapter.id] = await loadCache(deps.storage, adapter.id);
      continue;
    }
    anyAttempted = true;
    let snapshots: UsageSnapshot[];
    try {
      snapshots = await adapter.fetchSnapshots({
        network: deps.network,
        preferences: deps.preferences,
      });
    } catch {
      snapshots = [
        {
          sourceId: adapter.id,
          kind: 'quota',
          status: 'error',
          label: adapter.id,
          message: 'The provider returned an unexpected error.',
          isUnofficial: adapter.id !== 'openrouter',
        },
      ];
    }
    const allFailed =
      snapshots.length > 0 && snapshots.every((snapshot) => snapshot.status === 'error');
    await saveBackoff(
      deps.storage,
      adapter.id,
      allFailed ? nextBackoff(backoff, deps.now) : resetBackoff(),
    );
    const cache = { snapshots, fetchedAt: deps.now };
    await saveCache(deps.storage, adapter.id, cache);
    cachesBySource[adapter.id] = cache;
    if (deps.preferences.notifyOnLowQuota)
      await notify(
        deps.storage,
        deps.feedback,
        adapter.id,
        snapshots,
        Number(deps.preferences.notifyThresholdPercent ?? 10),
      );
  }
  return { cachesBySource, anyAttempted };
}

async function notify(
  storage: IStorageService,
  feedback: IFeedbackService,
  sourceId: SourceId,
  snapshots: UsageSnapshot[],
  threshold: number,
): Promise<void> {
  let label = await loadNotifiedLabel(storage, sourceId);
  for (const snapshot of snapshots) {
    if (shouldNotify(snapshot, threshold, label))
      await feedback.sendBackground({
        title: 'AI quota running low',
        body: `${snapshot.label} is below ${threshold}% remaining.`,
      });
    label = labelAfterSnapshot(snapshot, threshold, label);
  }
  await saveNotifiedLabel(storage, sourceId, label);
}
