// Only verified raster images enter the image cache.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rasterExtension } from './cache-images.mjs';

test('PNG はその拡張子で受け付ける', async () => {
  const png = await readFile(new URL('../public/images/avatar.png', import.meta.url));
  assert.equal(rasterExtension(png), 'png');
});

test('HTML は画像として受け付けない', () => {
  assert.throws(() => rasterExtension(Buffer.from('<html><script>alert(1)</script></html>')));
});

test('スクリプトを実行できる SVG は受け付けない', () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>';
  assert.throws(() => rasterExtension(Buffer.from(svg)));
});
