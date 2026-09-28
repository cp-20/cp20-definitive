import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rasterExtension } from './cache-images.mjs';
test('cached images are verified raster data, not HTML or executable SVG', async () => {
  assert.equal(
    rasterExtension(await readFile(new URL('../public/images/avatar.png', import.meta.url))),
    'png',
  );
  assert.throws(() => rasterExtension(Buffer.from('<html><script>alert(1)</script></html>')));
  assert.throws(() =>
    rasterExtension(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>',
      ),
    ),
  );
});
