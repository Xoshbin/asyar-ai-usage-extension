export type SourceId = 'codex' | 'claude' | 'openrouter';
export type SnapshotKind = 'quota' | 'credits';
export type SnapshotStatus = 'ok' | 'error' | 'unconfigured';

export interface UsageSnapshot {
  sourceId: SourceId;
  kind: SnapshotKind;
  status: SnapshotStatus;
  label: string;
  percentUsed?: number;
  resetsAt?: number | null;
  remainingUsd?: number;
  message?: string;
  isUnofficial: boolean;
}

export interface SourceReadResult {
  sourceId: SourceId;
  snapshots: UsageSnapshot[];
  fetchedAt: number;
  attempted: boolean;
}
export interface BackoffState {
  consecutiveFailures: number;
  nextAllowedAt: number;
}
export interface CachedSource {
  snapshots: UsageSnapshot[];
  fetchedAt: number;
}
