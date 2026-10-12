import { ExtensionContext as WorkerExtensionContext, extensionBridge } from 'asyar-sdk/worker';
import type {
  Extension,
  ExtensionContext,
  ExtensionResult,
  ExtensionStateProxy,
  IFeedbackService,
  INetworkService,
  IStatusBarService,
  IStorageService,
} from 'asyar-sdk/contracts';
import manifest from '../manifest.json';
import { claudeAdapter } from './adapters/claude';
import { codexAdapter } from './adapters/codex';
import { openrouterAdapter } from './adapters/openrouter';
import { runPollCycle } from './lib/poll';
import { normalizeCachedSource } from './lib/time';
import { compactTrayTitle, PROVIDER_NAMES } from './lib/tray';
import type { CachedSource, SourceId } from './lib/types';

const ctx = new WorkerExtensionContext();
ctx.setExtensionId(manifest.id);
const network = ctx.getService<INetworkService>('network');
const storage = ctx.getService<IStorageService>('storage');
const feedback = ctx.getService<IFeedbackService>('feedback');
const statusBar = ctx.getService<IStatusBarService>('statusBar');
const state = ctx.getService<ExtensionStateProxy>('state');
const adapters = [codexAdapter, claudeAdapter, openrouterAdapter];
const TRAY_ITEM_ID = 'ai-usage-tray';
let trayRegistered = false;

async function poll(): Promise<void> {
  const preferences = (ctx.preferences.values as Record<string, unknown>) ?? {};
  const result = await runPollCycle({
    adapters,
    storage,
    network,
    feedback,
    preferences,
    now: Date.now(),
  });
  updateTray(result.cachesBySource, Boolean(preferences.showInMenuBar));
  await state.set('updatedAt', Date.now());
}
async function loadCaches(): Promise<Partial<Record<SourceId, CachedSource | null>>> {
  const output: Partial<Record<SourceId, CachedSource | null>> = {};
  for (const adapter of adapters) {
    const raw = await storage.get(`source:${adapter.id}:cache`);
    output[adapter.id] =
      typeof raw === 'string' ? normalizeCachedSource(JSON.parse(raw) as CachedSource) : null;
  }
  return output;
}
function updateTray(
  caches: Partial<Record<SourceId, CachedSource | null>>,
  enabled: boolean,
): void {
  const values = Object.values(caches)
    .flatMap((cache) => cache?.snapshots ?? [])
    .filter((snapshot) => snapshot.status === 'ok' && typeof snapshot.percentUsed === 'number')
    .map((snapshot) => 100 - snapshot.percentUsed!);
  const lowest = values.length ? Math.min(...values) : null;
  const title = compactTrayTitle(caches);
  if (!enabled || lowest === null || title === null) {
    if (trayRegistered) statusBar.unregisterItem(TRAY_ITEM_ID);
    trayRegistered = false;
    return;
  }
  const submenu = Object.entries(caches)
    .flatMap(([sid, cache]) =>
      (cache?.snapshots ?? []).map((snapshot) => ({ sourceId: sid as SourceId, snapshot })),
    )
    .filter(({ snapshot }) => snapshot.status === 'ok')
    .map(({ sourceId, snapshot }, index) => ({
      id: `reading-${index}`,
      text:
        snapshot.kind === 'quota'
          ? `${PROVIDER_NAMES[sourceId]} ${shortWindowLabel(snapshot.label)}: ${Math.round(100 - (snapshot.percentUsed ?? 0))}% left${resetSuffix(snapshot.resetsAt)}`
          : `${PROVIDER_NAMES[sourceId]}: $${snapshot.remainingUsd?.toFixed(2) ?? '—'}`,
    }));
  const item = {
    id: TRAY_ITEM_ID,
    icon: '📊',
    title,
    text: `AI usage · ${Math.round(lowest)}% remaining`,
    submenu,
  };
  if (trayRegistered) statusBar.updateItem(TRAY_ITEM_ID, item);
  else {
    statusBar.registerItem(item);
    trayRegistered = true;
  }
}
function shortWindowLabel(label: string): string {
  if (label === '5-hour limit' || label === 'Session limit') return '5h';
  if (label === 'Weekly limit') return '7d';
  return label;
}
function resetSuffix(timestamp?: number | null): string {
  if (!timestamp || !Number.isFinite(timestamp)) return '';
  const minutes = Math.max(0, Math.ceil((timestamp - Date.now()) / 60_000));
  return ` · resets in ${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
ctx.onRequest<undefined, Partial<Record<SourceId, CachedSource | null>>>(
  'getSnapshots',
  loadCaches,
);
ctx.onRequest<undefined, void>('refreshNow', poll);
ctx.onPreferencesChanged(() => {
  const preferences = (ctx.preferences.values as Record<string, unknown>) ?? {};
  void loadCaches().then((caches) => updateTray(caches, Boolean(preferences.showInMenuBar)));
});

class AiUsageExt implements Extension {
  async initialize(_context: ExtensionContext): Promise<void> {}
  async activate(): Promise<void> {
    const preferences = (ctx.preferences.values as Record<string, unknown>) ?? {};
    updateTray(await loadCaches(), Boolean(preferences.showInMenuBar));
  }
  async deactivate(): Promise<void> {
    if (trayRegistered) statusBar.unregisterItem(TRAY_ITEM_ID);
    trayRegistered = false;
  }
  async executeCommand(id: string): Promise<unknown> {
    if (id === 'poll' || id === 'refresh') await poll();
    return undefined;
  }
  async search(_query: string): Promise<ExtensionResult[]> {
    return [];
  }
}

extensionBridge.registerManifest(
  manifest as unknown as Parameters<typeof extensionBridge.registerManifest>[0],
);
const extension = new AiUsageExt();
extensionBridge.registerExtensionImplementation(manifest.id, extension);
void extension.activate();
