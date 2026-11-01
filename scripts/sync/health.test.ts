import { test } from 'vitest';
import assert from 'node:assert/strict';
import { staleSources } from './health.ts';

test('取得に失敗し続けている時間が上限を超えた掲載先だけを報告する', () => {
  const now = Date.parse('2026-11-01T00:00:00Z');
  const sources = {
    ok: { status: 'ok', lastSuccess: '2026-09-01T00:00:00Z' },
    brief: { status: 'stale', lastSuccess: '2026-10-31T00:00:00Z' },
    long: { status: 'stale', lastSuccess: '2026-09-27T09:24:25Z' },
    never: { status: 'stale' },
  };
  assert.deepEqual(
    staleSources({ sources }, now).map((s) => s.name),
    ['long', 'never'],
  );
});
