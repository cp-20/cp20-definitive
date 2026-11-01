// The font stylesheet filter.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { dropWoffFallback, isFontFile } from '../src/data/font-css.mjs';

describe('dropWoffFallback', () => {
  test('WOFF2 もある src から WOFF の候補を外す', () => {
    const css =
      "@font-face{font-weight:500;src:url(./a.woff2) format('woff2'),url(./a.woff) format('woff');}";
    assert.equal(dropWoffFallback(css), "@font-face{font-weight:500;src:url(./a.woff2) format('woff2');}");
  });

  test('WOFF しかない src はそのまま残す', () => {
    const only = "@font-face{src:url(./a.woff) format('woff');}";
    assert.equal(dropWoffFallback(only), only);
  });
});

describe('isFontFile', () => {
  for (const [file, font] of [
    ['/x/zen-maru-gothic-10-500-normal.woff2', true],
    ['a.woff?v=1', true],
    ['/images/avatar.png', false],
  ])
    test(`${file} は${font ? 'フォント' : 'フォントではない'}`, () => {
      assert.equal(isFontFile(file), font);
    });
});
