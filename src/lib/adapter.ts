import type { INetworkService } from 'asyar-sdk/contracts';
import type { SourceId, UsageSnapshot } from './types';
export interface AdapterDeps {
  network: INetworkService;
  preferences: Record<string, unknown>;
}
export interface UsageAdapter {
  readonly id: SourceId;
  isConfigured(deps: AdapterDeps): boolean;
  fetchSnapshots(deps: AdapterDeps): Promise<UsageSnapshot[]>;
}
