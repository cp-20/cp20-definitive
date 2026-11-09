// The name printed on a manga's spine. The built shelf is checked in scripts/build/dist.test.ts.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { spineAuthor } from './series-credit.ts';

test('背表紙には、括弧の前の最初の名前だけを書く', () => {
  assert.equal(spineAuthor('柳ゆうと (原作：もちもち物質 キャラクター原案：ペペロン)'), '柳ゆうと');
  assert.equal(spineAuthor('ある作者（原作：別の人）'), 'ある作者');
});

test('名前がひとつなら、そのまま背表紙に書く', () => {
  assert.equal(spineAuthor('松田舞'), '松田舞');
});
