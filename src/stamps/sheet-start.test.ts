// Whether the sticker sheet starts open.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { SHEET_DESK_SPACE, sheetStartsOpen } from './sheet-start.ts';

for (const [stored, viewport, pageRight, open, why] of [
  [null, 1440, 1300, false, '1440px の画面ではページにかかるので閉じておく'],
  [null, 1024, 1004, false, 'タブレットでは閉じておく'],
  [null, 390, 390, false, 'スマートフォンでは閉じておく'],
  [null, 1920, 1540, true, 'ページの横に置ける広い画面では開いておく'],
  [null, 1800, 1800 - SHEET_DESK_SPACE, true, 'ちょうど置ける幅なら開いておく'],
  ['open', 390, 390, true, '前回開いていたなら、狭い画面でも開く'],
  ['closed', 2560, 1860, false, '前回閉じていたなら、広い画面でも閉じておく'],
] as [string | null, number, number, boolean, string][])
  test(why, () => {
    assert.equal(sheetStartsOpen(stored, viewport, pageRight), open);
  });
