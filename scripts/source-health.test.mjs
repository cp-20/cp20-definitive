import { test } from 'vitest';
import assert from 'node:assert/strict';
import { staleSources } from './source-health.mjs';

test('only sources failing for longer than the limit are reported', () => {
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
