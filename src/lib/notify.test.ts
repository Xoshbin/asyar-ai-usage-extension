import { describe, expect, it } from 'vitest';
import type { UsageSnapshot } from './types';
import { labelAfterSnapshot, shouldNotify } from './notify';
const snapshot = (percentUsed: number): UsageSnapshot => ({
  sourceId: 'codex',
  kind: 'quota',
  status: 'ok',
  label: '5-hour limit',
  percentUsed,
  isUnofficial: true,
});
describe('notify', () => {
  it('notifies only once while below threshold', () => {
    expect(shouldNotify(snapshot(42), 10, null)).toBe(false);
    expect(shouldNotify(snapshot(95), 10, null)).toBe(true);
    expect(shouldNotify(snapshot(96), 10, '5-hour limit')).toBe(false);
  });
  it('clears the label after recovery', () => {
    expect(labelAfterSnapshot(snapshot(50), 10, '5-hour limit')).toBeNull();
  });
  it('ignores credits and errors', () => {
    expect(
      shouldNotify(
        {
          sourceId: 'openrouter',
          kind: 'credits',
          status: 'ok',
          label: 'Credits',
          isUnofficial: false,
        },
        10,
        null,
      ),
    ).toBe(false);
    expect(shouldNotify({ ...snapshot(95), status: 'error' }, 10, null)).toBe(false);
  });
});
