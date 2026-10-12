import type { IStorageService } from 'asyar-sdk/contracts';
import type { BackoffState, CachedSource, SourceId } from './types';
import { resetBackoff } from './backoff';

const cacheKey = (id: SourceId) => `source:${id}:cache`;
const backoffKey = (id: SourceId) => `source:${id}:backoff`;
const notifyKey = (id: SourceId) => `notify:${id}:lastNotifiedLabel`;

async function parse<T>(storage: IStorageService, key: string): Promise<T | null> {
  const raw = await storage.get(key);
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
export function loadCache(storage: IStorageService, id: SourceId): Promise<CachedSource | null> {
  return parse(storage, cacheKey(id));
}
export async function saveCache(
  storage: IStorageService,
  id: SourceId,
  cache: CachedSource,
): Promise<void> {
  await storage.set(cacheKey(id), JSON.stringify(cache));
}
export async function loadBackoff(storage: IStorageService, id: SourceId): Promise<BackoffState> {
  return (await parse<BackoffState>(storage, backoffKey(id))) ?? resetBackoff();
}
export async function saveBackoff(
  storage: IStorageService,
  id: SourceId,
  state: BackoffState,
): Promise<void> {
  await storage.set(backoffKey(id), JSON.stringify(state));
}
export async function loadNotifiedLabel(
  storage: IStorageService,
  id: SourceId,
): Promise<string | null> {
  const value = await storage.get(notifyKey(id));
  return typeof value === 'string' ? value : null;
}
export async function saveNotifiedLabel(
  storage: IStorageService,
  id: SourceId,
  label: string | null,
): Promise<void> {
  if (label === null) await storage.delete(notifyKey(id));
  else await storage.set(notifyKey(id), label);
}
