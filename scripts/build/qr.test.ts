// The QR code in the footer's dialog is the site's own address with digits after a #, chosen so
// the code's own modules draw the site's clover, and drawn ahead of time.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import jsQR from 'jsqr';
import sharp from 'sharp';
import { encode } from 'uqr';
import { PREFIX, VERSION, artAt, dataBits, modules, qrArt, qrFile, qrSvg } from './qr.ts';

const art = qrArt();
const size = 17 + 4 * VERSION;

test('public/images/qr-cp20.svg は今の生成結果と同じ', () => {
  assert.equal(readFileSync(qrFile, 'utf8'), qrSvg());
});

test('符号にするのは https://cp20.dev/# と数字だけ', () => {
  assert.match(art.text, /^https:\/\/cp20\.dev\/#\d+$/);
});

describe('符号化', () => {
  test.each([0, 1, 2, 3, 4, 5, 6, 7])(
    '数字のないアドレスは、マスク %i で uqr と同じモジュールになる',
    (mask) => {
      const reference = encode(PREFIX, {
        ecc: 'M',
        minVersion: VERSION,
        maxVersion: VERSION,
        maskPattern: mask,
        border: 0,
      });
      assert.deepEqual(modules(dataBits(''), mask), reference.data);
    },
  );
});

describe('クローバーの絵', () => {
  const cells = Array.from({ length: size * size }, (_, i) => [i % size, Math.floor(i / size)] as const);
  const clover = cells.filter(([x, y]) => artAt(x, y) === 'clover');
  const ground = cells.filter(([x, y]) => artAt(x, y) === 'ground');

  test('クローバーのモジュールはほぼすべて黒く、まわりの1モジュールはほぼすべて白い', () => {
    const dark = clover.filter(([x, y]) => art.modules[y][x]).length;
    const light = ground.filter(([x, y]) => !art.modules[y][x]).length;
    assert.ok(dark / clover.length >= 0.98, `${dark}/${clover.length}`);
    assert.ok(light / ground.length >= 0.9, `${light}/${ground.length}`);
  });

  // Drawn as the dialog shows it (264px) and at half that, then read by a decoder.
  test.each([264, 132])('%ipx に描いた絵をデコーダが同じアドレスと読む', async (px) => {
    // An SVG without a size is drawn at its viewBox's size at 72 dpi.
    const { data: rgba, info } = await sharp(readFileSync(qrFile), { density: (72 * px) / (size + 8) })
      .resize(px, px)
      .flatten({ background: '#fff' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const read = jsQR(new Uint8ClampedArray(rgba), info.width, info.height);
    assert.equal(read?.data, art.text);
  });
});
