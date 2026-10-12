import type { BackoffState } from './types';

const BASE_DELAY_MS = 60_000;
const MAX_DELAY_MS = 30 * 60_000;

export function nextBackoff(state: BackoffState, now: number): BackoffState {
  const consecutiveFailures = state.consecutiveFailures + 1;
  const raw = Math.min(BASE_DELAY_MS * 2 ** (consecutiveFailures - 1), MAX_DELAY_MS);
  return { consecutiveFailures, nextAllowedAt: now + raw * (0.8 + Math.random() * 0.4) };
}
export function resetBackoff(): BackoffState {
  return { consecutiveFailures: 0, nextAllowedAt: 0 };
}
export function isBackedOff(state: BackoffState, now: number): boolean {
  return now < state.nextAllowedAt;
}
