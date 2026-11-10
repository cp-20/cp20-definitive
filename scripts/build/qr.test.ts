// The QR code in the footer's dialog is the site's own address, drawn ahead of time, with the
// site's clover in its middle that error correction reads through.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import jsQR from 'jsqr';
import sharp from 'sharp';
import { ART, qrFile, qrLayout, qrSvg } from './qr.ts';
import { SITE_ORIGIN } from '../../src/site/pages.ts';

test('public/images/qr-cp20.svg は https://cp20.dev を表す今の生成結果と同じ', () => {
  assert.equal(readFileSync(qrFile, 'utf8'), qrSvg(SITE_ORIGIN));
});

// The cells the SVG paints, as "x,y": each `Mx yhN` is a run of N modules along row y.
const painted = (svg: string) =>
  [...svg.matchAll(/M(\d+) (\d+)h(\d+)/g)].flatMap(([, x, y, run]) =>
    Array.from({ length: Number(run) }, (_, i) => `${Number(x) + i},${y}`),
  );

describe('QR コードの絵', () => {
  const { data, size, cleared } = qrLayout(SITE_ORIGIN);

  test('誤り訂正 H の符号の黒いモジュールを、まん中の空き地のほかはすべて、まわりに4モジュールの余白を残して描く', () => {
    const dark = data.flatMap((row, y) =>
      row.flatMap((on, x) => (on && !cleared(x, y) ? [`${x + 4},${y + 4}`] : [])),
    );
    const svg = qrSvg(SITE_ORIGIN);
    assert.deepEqual(painted(svg).sort(), dark.sort());
    assert.match(svg, new RegExp(`viewBox="0 0 ${size + 8} ${size + 8}"`));
  });

  test('クローバーの空き地は符号の10%以下（H が直せる約30%の3分の1）', () => {
    assert.ok((ART * ART) / (size * size) <= 0.1, `${ART}² / ${size}²`);
  });

  // Drawn as the dialog shows it (264px) and at half that, then read by a decoder.
  test.each([264, 132])('%ipx に描いた絵をデコーダが https://cp20.dev と読む', async (px) => {
    // An SVG without a size is drawn at its viewBox's size at 72 dpi.
    const { data: rgba, info } = await sharp(readFileSync(qrFile), { density: (72 * px) / (size + 8) })
      .resize(px, px)
      .flatten({ background: '#fff' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const read = jsQR(new Uint8ClampedArray(rgba), info.width, info.height);
    assert.equal(read?.data, SITE_ORIGIN);
  });
});
