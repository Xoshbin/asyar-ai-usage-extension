import type { CachedSource, SourceId, UsageSnapshot } from './types';

export const PROVIDER_NAMES: Record<SourceId, string> = {
  codex: 'Codex',
  claude: 'Claude',
  openrouter: 'OpenRouter',
};

const SESSION_LABELS = new Set(['5-hour limit', 'Session limit']);
const SOURCE_ORDER: SourceId[] = ['codex', 'claude', 'openrouter'];

export function compactTrayTitle(
  caches: Partial<Record<SourceId, CachedSource | null>>,
): string | null {
  const parts: string[] = [];
  for (const sourceId of SOURCE_ORDER) {
    const cache = caches[sourceId];
    const session = (cache?.snapshots ?? []).find(
      (s): s is UsageSnapshot & { percentUsed: number } =>
        s.status === 'ok' &&
        s.kind === 'quota' &&
        typeof s.percentUsed === 'number' &&
        SESSION_LABELS.has(s.label),
    );
    if (session) parts.push(`5h ${Math.round(session.percentUsed)}%`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}
