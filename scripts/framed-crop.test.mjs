// YouTube thumbnails are 4:3 files around a 16:9 video, sometimes with the video's own black bars
// or pillars as well; the pages show only the 16:9 picture cut out of those bands.
import { test } from 'node:test';
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

test('framedCrop cuts letterbox and pillarbox bands, then takes a centred 16:9 picture', () => {
  // A plain hqdefault: the 16:9 video between YouTube's own bars.
  assert.deepEqual(framedCrop(image(480, 360, { top: 45, bottom: 45 }), 480, 360), {
    left: 0,
    top: 45,
    width: 480,
    height: 270,
  });
  // A cinemascope video: deeper bars, so the sides are cut instead.
  assert.deepEqual(framedCrop(image(480, 360, { top: 78, bottom: 76 }), 480, 360), {
    left: 57,
    top: 78,
    width: 366,
    height: 206,
  });
  // A 4:3-ish video pillarboxed in grey inside the 16:9 frame.
  assert.deepEqual(
    framedCrop(image(480, 360, { top: 45, bottom: 45, left: 104, right: 104, band: 60 }), 480, 360),
    {
      left: 104,
      top: 103,
      width: 272,
      height: 153,
    },
  );
});

test('framedCrop keeps flat artwork on one side, but trims a thin stray line', () => {
  // 41 flat columns on the right only are part of the picture, not a pillar.
  const oneSide = framedCrop(image(480, 360, { top: 45, bottom: 45, right: 41 }), 480, 360);
  assert.deepEqual(oneSide, { left: 0, top: 45, width: 480, height: 270 });
  // A 3px dark line at the top edge is trimmed even though the bottom has none extra.
  const line = framedCrop(image(480, 360, { top: 48, bottom: 45 }), 480, 360);
  assert.equal(line.top >= 48, true);
  assert.equal(line.top + line.height <= 315, true);
  assert.ok(Math.abs(line.width / line.height - 16 / 9) < 0.01);
});

test('the committed track thumbnails are shown only as band-free 16:9 copies', async () => {
  const load = async (name) =>
    JSON.parse(await readFile(new URL(`../src/data/${name}.json`, import.meta.url), 'utf8'));
  const [tracks, cache] = await Promise.all([load('tracks'), load('image-cache')]);
  const framed = framedSources(tracks);
  assert.equal(framed.size, tracks.length);
  const { images } = clientMedia({}, cache, [...framed]);
  for (const source of framed) {
    const entry = cache[source];
    assert.ok(entry.crop, source);
    assert.ok(Math.abs(entry.crop.width / entry.crop.height - 16 / 9) < 0.01, source);
    // The original 4:3 file is never a candidate, and the largest copy is the full cut-out.
    assert.ok(!images[source].srcset.includes(entry.file), source);
    assert.equal(images[source].src, entry.variants.at(-1).file);
    assert.equal(entry.variants.at(-1).width, entry.crop.width);
    const file = new URL(`../public${images[source].src}`, import.meta.url).pathname;
    const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
    // No near-black or flat band left along any edge of the copy.
    const crop = framedCrop(data, info.width, info.height);
    assert.ok(
      crop.width >= info.width - 2 && crop.height >= info.height - 2,
      `${source} ${JSON.stringify(crop)}`,
    );
  }
});
