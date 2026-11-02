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
  // The spine's picture shows 1/zoom of the cover's width around the face (and as much of its
  // height); a face nearer the edge than that would leave the frame partly empty.
  for (const [title, { face, zoom }] of Object.entries(mangaCovers))
    test(`「${title}」の背表紙の絵は表紙の内側から切り出す`, () => {
      assert.ok(zoom >= 1, `zoom ${zoom}`);
      const half = 1 / zoom / 2;
      const halfDown = (half * 480) / 682;
      assert.ok(face[0] >= half && face[0] <= 1 - half, `face x ${face[0]}`);
      assert.ok(face[1] >= halfDown && face[1] <= 1 - halfDown, `face y ${face[1]}`);
    });
});
