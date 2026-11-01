// The sticker UI's DOM-free parts: the spring of the sticker in hand, sign-in messages and the
// limits shared with database.rules.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MAX_TILT, springStep } from '../src/data/stamp-motion.mjs';
import { signInMessage } from '../src/data/stamp-a11y.mjs';
import {
  STAMPS_PER_PAGE,
  STAMP_SLOTS,
  STICKER_KIND_COUNT,
  WRITE_INTERVAL_MS,
  WRITE_SPACING_MS,
} from '../src/data/stamp-limits.mjs';

test('the sticker in hand comes to rest on its target and never leans past the limit', () => {
  const m = { x: 0, y: 0, tx: 400, ty: -300, tilt: 0, scale: 1, ts: 1.18 };
  let frames = 0,
    widest = 0;
  while (!springStep(m)) {
    widest = Math.max(widest, Math.abs(m.tilt));
    assert.ok(++frames < 200, 'settles');
  }
  assert.ok(widest > 10 && widest <= MAX_TILT, String(widest));
  assert.ok(Math.abs(m.x - 400) < 1 && Math.abs(m.y + 300) < 1);
  assert.ok(Math.abs(m.scale - 1.18) < 0.01);
  // A sticker already at rest stays there.
  assert.equal(springStep({ x: 5, y: 5, tx: 5, ty: 5, tilt: 0, scale: 1, ts: 1 }), true);
});

test('sign-in failures are worded by their code; closing the popup says nothing', () => {
  assert.equal(signInMessage('auth/popup-closed-by-user'), '');
  assert.equal(signInMessage('auth/cancelled-popup-request'), '');
  assert.equal(signInMessage('timeout'), '接続できませんでした。もう一度押してください');
  assert.equal(signInMessage('auth/popup-blocked'), 'ポップアップが開けませんでした。もう一度押してください');
  for (const code of [undefined, '', 'auth/network-request-failed'])
    assert.equal(signInMessage(code), 'ログインできませんでした');
});

test('the shared limits agree with each other and with the sticker designs', async () => {
  assert.deepEqual(STAMP_SLOTS, ['0', '1', '2', '3', '4']);
  assert.equal(STAMP_SLOTS.length, STAMPS_PER_PAGE);
  assert.ok(WRITE_SPACING_MS > WRITE_INTERVAL_MS);
  const kinds = await readFile(new URL('../src/components/sticker/kinds.tsx', import.meta.url), 'utf8');
  const list = kinds.slice(kinds.indexOf('STICKER_KINDS = ['), kinds.indexOf('];'));
  assert.equal(list.match(/\{ symbol: /g).length, STICKER_KIND_COUNT);
});
