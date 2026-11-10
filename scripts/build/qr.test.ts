// The QR code in the footer's dialog is the site's own address, drawn ahead of time.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { encode } from 'uqr';
import { qrFile, qrSvg } from './qr.ts';
import { SITE_ORIGIN } from '../../src/site/pages.ts';

test('public/images/qr-cp20.svg は https://cp20.dev を表す今の生成結果と同じ', () => {
  assert.equal(readFileSync(qrFile, 'utf8'), qrSvg(SITE_ORIGIN));
});

// The cells the SVG paints, as "x,y": each `Mx yhN` is a run of N modules along row y.
const painted = (svg: string) =>
  [...svg.matchAll(/M(\d+) (\d+)h(\d+)/g)].flatMap(([, x, y, run]) =>
    Array.from({ length: Number(run) }, (_, i) => `${Number(x) + i},${y}`),
  );

test('符号の黒いモジュールだけを、まわりに4モジュールの余白を残して描く', () => {
  const { data, size } = encode(SITE_ORIGIN, { ecc: 'M', boostEcc: true, border: 0 });
  const dark = data.flatMap((row, y) => row.flatMap((on, x) => (on ? [`${x + 4},${y + 4}`] : [])));
  const svg = qrSvg(SITE_ORIGIN);
  assert.deepEqual(painted(svg).sort(), dark.sort());
  assert.match(svg, new RegExp(`viewBox="0 0 ${size + 8} ${size + 8}"`));
});
