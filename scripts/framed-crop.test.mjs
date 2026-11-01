// YouTube thumbnails are 4:3 files around a 16:9 video, sometimes with the video's own black bars
// or pillars as well; the pages show only the 16:9 picture cut out of those bands.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { framedCrop, framedSources } from './image-variants.mjs';
import { clientMedia } from '../src/data/client-media.mjs';

/** A `width`×`height` greyscale image: noisy artwork inside the given bands of flat colour. */
function image(width, height, { top = 0, bottom = 0, left = 0, right = 0, band = 0 } = {}) {
  const gray = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const inside = y >= top && y < height - bottom && x >= left && x < width - right;
      gray[y * width + x] = inside ? (x * 37 + y * 91) % 200 : band;
    }
  return gray;
}

describe('framedCrop', () => {
  for (const [why, bands, crop] of [
    [
      '普通の hqdefault は、上下の帯の間の 16:9 を切り出す',
      { top: 45, bottom: 45 },
      { left: 0, top: 45, width: 480, height: 270 },
    ],
    [
      'シネスコの動画は帯が深いぶん、左右を切って 16:9 にする',
      { top: 78, bottom: 76 },
      { left: 57, top: 78, width: 366, height: 206 },
    ],
    [
      '16:9 の枠に灰色の柱で入った 4:3 の動画は、柱も切る',
      { top: 45, bottom: 45, left: 104, right: 104, band: 60 },
      { left: 104, top: 103, width: 272, height: 153 },
    ],
    [
      '片側だけの平らな部分は柱ではなく絵の一部として残す',
      { top: 45, bottom: 45, right: 41 },
      { left: 0, top: 45, width: 480, height: 270 },
    ],
  ])
    test(why, () => {
      assert.deepEqual(framedCrop(image(480, 360, bands), 480, 360), crop);
    });

  test('上端の細い線は、反対側になくても切る', () => {
    const line = framedCrop(image(480, 360, { top: 48, bottom: 45 }), 480, 360);
    assert.deepEqual([line.top >= 48, line.top + line.height <= 315], [true, true]);
  });

  test('切り出すのはいつも 16:9', () => {
    const line = framedCrop(image(480, 360, { top: 48, bottom: 45 }), 480, 360);
    assert.ok(Math.abs(line.width / line.height - 16 / 9) < 0.01);
  });
});

describe('コミットされた音楽のサムネイル', async () => {
  const load = async (name) =>
    JSON.parse(await readFile(new URL(`../src/data/${name}.json`, import.meta.url), 'utf8'));
  const [tracks, cache] = await Promise.all([load('tracks'), load('image-cache')]);
  const framed = framedSources(tracks);
  const { images } = clientMedia({}, cache, [...framed]);

  test('すべての曲のサムネイルを切り出しの対象にする', () => {
    assert.equal(framed.size, tracks.length);
  });

  for (const source of framed) {
    const entry = cache[source];
    test(`${entry.file} は 16:9 の切り出しを記録している`, () => {
      assert.ok(Math.abs(entry.crop.width / entry.crop.height - 16 / 9) < 0.01);
    });

    test(`${entry.file} の元の 4:3 のファイルは候補に入れない`, () => {
      assert.equal(images[source].srcset.includes(entry.file), false);
    });

    test(`${entry.file} の最大の候補は、切り出した全体`, () => {
      assert.deepEqual(
        [images[source].src, entry.variants.at(-1).width],
        [entry.variants.at(-1).file, entry.crop.width],
      );
    });

    test(`${entry.file} の表示するコピーの端には、黒や平らな帯が残っていない`, async () => {
      const file = new URL(`../public${images[source].src}`, import.meta.url).pathname;
      const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
      const crop = framedCrop(data, info.width, info.height);
      assert.deepEqual([crop.width >= info.width - 2, crop.height >= info.height - 2], [true, true]);
    });
  }
});
