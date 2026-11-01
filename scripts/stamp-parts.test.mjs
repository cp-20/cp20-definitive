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

test('a finger scrolls past your stickers and a tapped one floats clear of it, on screen', async () => {
  const { HOLD_SLOP, LIFT, liftedSpot, waitsForHold } = await import('../src/data/stamp-touch.mjs');
  // Only your stickers on the page wait for a long press, and only under a finger or pen.
  assert.equal(waitsForHold({ from: 'page', pointer: 'touch' }), true);
  assert.equal(waitsForHold({ from: 'page', pointer: 'pen' }), true);
  assert.equal(waitsForHold({ from: 'page', pointer: 'mouse' }), false);
  assert.equal(waitsForHold({ from: 'sheet', pointer: 'touch' }), false);
  assert.ok(HOLD_SLOP > 6, 'a still finger is not mistaken for a swipe');
  // Room above the finger: it floats up there.
  assert.deepEqual(liftedSpot(200, 400, 390, 664, 80), { x: 200, y: 400 - LIFT });
  // Near the top of the screen (or under the hint bar) it goes below the finger instead.
  assert.deepEqual(liftedSpot(300, 30, 390, 664, 80), { x: 300, y: 30 + LIFT });
  assert.deepEqual(liftedSpot(300, 120, 390, 664, 80), { x: 300, y: 120 + LIFT });
  // It never leaves the screen, even on one too short for either.
  for (const [x, y, w, h] of [
    [2, 0, 390, 664],
    [389, 660, 390, 664],
    [100, 40, 390, 100],
  ]) {
    const spot = liftedSpot(x, y, w, h, 80);
    assert.ok(spot.x >= 25 && spot.x <= w - 25 && spot.y >= 25 && spot.y <= h - 25, JSON.stringify(spot));
  }
});

test('a sticker waiting for its spot stays on screen when the phone is turned', async () => {
  const { keptOnScreen } = await import('../src/data/stamp-touch.mjs');
  // Held near the bottom of a portrait screen, then turned to landscape (412×839 → 839×412).
  assert.deepEqual(keptOnScreen(322, 672, 839, 412, 80), { x: 322, y: 412 - 30 });
  // Already in view: left where it is.
  assert.deepEqual(keptOnScreen(200, 300, 839, 412, 80), { x: 200, y: 300 });
  // Never under the hint bar, nor past the right edge.
  assert.deepEqual(keptOnScreen(900, 10, 839, 412, 80), { x: 839 - 30, y: 80 + 30 });
  // A screen too short for both keeps it on screen first.
  const short = keptOnScreen(100, 10, 300, 90, 80);
  assert.ok(short.y >= 30 && short.y <= 60, JSON.stringify(short));
});
