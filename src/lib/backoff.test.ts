import { describe, expect, it } from 'vitest';
import { isBackedOff, nextBackoff, resetBackoff } from './backoff';

describe('backoff', () => {
  it('starts at one failure with about a one-minute delay', () => {
    const state = nextBackoff(resetBackoff(), 0);
    expect(state.consecutiveFailures).toBe(1);
    expect(state.nextAllowedAt).toBeGreaterThanOrEqual(48_000);
    expect(state.nextAllowedAt).toBeLessThanOrEqual(72_000);
  });

  it('caps the exponential delay at 30 minutes', () => {
    let state = resetBackoff();
    for (let index = 0; index < 10; index += 1) state = nextBackoff(state, 0);
    expect(state.consecutiveFailures).toBe(10);
    expect(state.nextAllowedAt).toBeLessThanOrEqual(2_160_000);
  });

  it('resets failures and restriction', () => {
    const state = resetBackoff();
    expect(state).toEqual({ consecutiveFailures: 0, nextAllowedAt: 0 });
    expect(isBackedOff(state, Date.now())).toBe(false);
  });

  it('reports whether the source is currently backed off', () => {
    const state = { consecutiveFailures: 1, nextAllowedAt: 1_000 };
    expect(isBackedOff(state, 500)).toBe(true);
    expect(isBackedOff(state, 1_500)).toBe(false);
  });
});
