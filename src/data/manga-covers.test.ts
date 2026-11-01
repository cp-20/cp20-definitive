// The colours the bookshelf draws each spine with.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { mangaCovers } from './manga-covers.ts';

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('漫画の背表紙', () => {
  for (const [title, { spine, ink }] of Object.entries(mangaCovers))
    test(`「${title}」の背表紙の文字は 4.5:1 以上のコントラストで読める`, () => {
      assert.ok(contrast(spine, ink) >= 4.5, `${ink} on ${spine} is ${contrast(spine, ink).toFixed(2)}:1`);
    });
});
