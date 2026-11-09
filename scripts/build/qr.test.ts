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

test('黒いモジュールの数は符号と同じで、まわりに4モジュールの余白がある', () => {
  const { data, size } = encode(SITE_ORIGIN, { ecc: 'M', boostEcc: true, border: 0 });
  const svg = qrSvg(SITE_ORIGIN);
  const area = [...svg.matchAll(/h(\d+)v1/g)].reduce((sum, m) => sum + Number(m[1]), 0);
  assert.deepEqual(
    [area, svg.match(/viewBox="0 0 (\d+) /)?.[1], /M[0-3] |M\d+ [0-3]h/.test(svg)],
    [data.flat().filter(Boolean).length, String(size + 8), false],
  );
});
