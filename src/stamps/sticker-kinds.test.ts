import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { SHEET_KINDS, STICKER_KINDS } from './sticker-kinds.ts';

describe('シールの種類', () => {
  test('保存済みの番号は変わらない：これまでの種類は整理したものも同じ番号に残り、新しい種類は後ろに足す', () => {
    assert.deepEqual(
      STICKER_KINDS.map((k) => k.symbol),
      [
        ...['clover', 'thumb', 'sparkles', 'eyes', 'heart', '', 'suki', 'naruhodo', 'arigato'],
        ...['emo', 'wakaru', 'manabi', 'erai', 'kawaii', 'otsukare', 'omedeto', 'tensai'],
      ],
    );
  });

  test('シール帳は、整理していない種類だけをそれぞれ1度ずつ、10〜12個並べる', () => {
    const offered = STICKER_KINDS.flatMap((k, kind) => (k.retired ? [] : [kind]));
    assert.deepEqual(
      [...SHEET_KINDS].sort((a, b) => a - b),
      offered,
    );
    assert.equal(new Set(SHEET_KINDS).size, SHEET_KINDS.length);
    assert.ok(
      SHEET_KINDS.length >= 10 && SHEET_KINDS.length <= 12,
      `${SHEET_KINDS.length} stickers on the sheet`,
    );
  });

  test('シール帳は絵と文字を混ぜ、文字のシールは4〜6語にとどめ、同じ種類を3つ続けて並べない', () => {
    const isWord = (kind: number) => STICKER_KINDS[kind].name.startsWith('「');
    const words = SHEET_KINDS.filter(isWord).length;
    assert.ok(words >= 4 && words <= 6, `${words} words`);
    assert.ok(SHEET_KINDS.length - words >= words, 'no more words than pictures');
    const runs = SHEET_KINDS.filter(
      (kind, i) => i >= 2 && [0, 1, 2].every((d) => isWord(SHEET_KINDS[i - d]) === isWord(kind)),
    );
    assert.deepEqual(runs, []);
  });

  test('どの種類も、整理したものも含めて絵がある（記号のない種類は本人のアイコン）', () => {
    const missing = STICKER_KINDS.filter(
      (k) => k.symbol && !existsSync(new URL(`../../public/stamps/${k.symbol}.svg`, import.meta.url)),
    ).map((k) => k.symbol);
    assert.deepEqual(missing, []);
    assert.ok(existsSync(new URL('../../public/images/avatar-384.webp', import.meta.url)));
  });
});
