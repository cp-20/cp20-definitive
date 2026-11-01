// The web fonts the build ships: the subset of Zen Maru Gothic (its characters, the @font-face
// rules, and the copyright and license records it must keep under the SIL OFL) and the filter
// that drops the WOFF fallbacks from the other @fontsource stylesheets.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync } from 'node:zlib';
import subsetFont from 'subset-font';
import {
  collectCharacters,
  dropWoffFallback,
  fontHead,
  isFontFile,
  subsetOptions,
  weights,
} from './fonts.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const built = (path: string) => join(root, 'dist/client', path);
const skip = !existsSync(built('404.html'));

describe('collectCharacters', () => {
  const chars = collectCharacters(['あ', '"\\u3044\\u{1F600}"', '<p>&#x3046;&#12360;</p>', '\u0007']);

  test('そのままの文字、\\u エスケープ、文字参照、印字可能な ASCII を含める', () => {
    assert.deepEqual(
      ['あ', 'い', '😀', 'う', 'え', 'A'].filter((c) => !chars.includes(c)),
      [],
    );
  });

  test('制御文字は含めない', () => {
    assert.ok(!chars.includes('\u0007'));
  });
});

test('fontHead は太さごとに、1つの WOFF2 だけを指す @font-face を宣言する', () => {
  const head = fontHead([
    { weight: 500, href: '/assets/z-500-a.woff2' },
    { weight: 700, href: '/assets/z-700-b.woff2' },
  ]);
  assert.deepEqual(
    [
      head.match(/@font-face/g)?.length,
      head.includes("font-weight:500;src:url(/assets/z-500-a.woff2) format('woff2')}"),
    ],
    [2, true],
  );
});

for (const weight of weights)
  test(`同梱した Zen Maru Gothic ${weight} は、小さな WOFF2 に絞り込める`, async () => {
    const full = readFileSync(join(root, `fonts/zen-maru-gothic/zen-maru-gothic-${weight}.woff2`));
    const subset = await subsetFont(full, 'しーぴーのスタンプ帳cp20', { targetFormat: 'woff2' });
    assert.deepEqual([subset.subarray(0, 4).toString('latin1'), subset.length < 20_000], ['wOF2', true]);
  });

// The `name` table of a WOFF2 font: nameID → string (Windows Unicode records first).
function nameRecords(woff2: Buffer) {
  const view = new DataView(woff2.buffer, woff2.byteOffset, woff2.byteLength);
  assert.equal(view.getUint32(0), 0x774f4632, 'WOFF2 signature');
  const numTables = view.getUint16(12);
  const compressedSize = view.getUint32(20);
  let at = 48;
  const base128 = () => {
    let value = 0;
    for (let i = 0; i < 5; i++) {
      const byte = view.getUint8(at++);
      value = value * 128 + (byte & 0x7f);
      if (!(byte & 0x80)) return value;
    }
    throw Error('bad UIntBase128');
  };
  const known = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name'];
  let offset = 0,
    name: { offset: number; length: number } | undefined;
  for (let i = 0; i < numTables; i++) {
    const flags = view.getUint8(at++);
    const index = flags & 0x3f;
    const tag =
      index === 63 ? String.fromCharCode(...woff2.subarray(at, (at += 4))) : (known[index] ?? index);
    let length = base128();
    const version = flags >> 6;
    const transformed = index === 10 || index === 11 ? version === 0 : version !== 0;
    if (transformed) length = base128();
    if (tag === 'name') name = { offset, length };
    offset += length;
  }
  assert.ok(name, 'name table');
  const data = brotliDecompressSync(woff2.subarray(at, at + compressedSize));
  const table = new DataView(data.buffer, data.byteOffset + name!.offset, name!.length);
  const count = table.getUint16(2),
    strings = table.getUint16(4);
  const out = new Map<number, string>();
  for (let i = 0; i < count; i++) {
    const r = 6 + i * 12;
    const [platform, , , id, length, start] = [0, 2, 4, 6, 8, 10].map((o) => table.getUint16(r + o));
    const bytes = data.subarray(name!.offset + strings + start, name!.offset + strings + start + length);
    const text =
      platform === 3 || platform === 0
        ? String.fromCharCode(
            ...Array.from({ length: length / 2 }, (_, k) => (bytes[2 * k] << 8) | bytes[2 * k + 1]),
          )
        : bytes.toString('latin1');
    if (!out.has(id) || platform === 3) out.set(id, text);
  }
  return out;
}

const fontLicense = (names: Map<number, string>) => {
  assert.match(names.get(13) ?? '', /SIL Open Font License, Version 1\.1/);
  assert.match(names.get(14) ?? '', /scripts\.sil\.org\/OFL|openfontlicense\.org/);
  assert.match(names.get(0) ?? '', /Copyright/);
};

describe('Zen Maru Gothic の絞り込み', async () => {
  const source = readFileSync(join(root, 'fonts/zen-maru-gothic/zen-maru-gothic-500.woff2'));
  const original = nameRecords(source);
  const names = nameRecords(await subsetFont(source, 'あa', subsetOptions));

  test('絞り込んだフォントにも著作権と OFL の記載が残る', () => {
    fontLicense(names);
  });

  test('デザイナーやライセンスの name レコードは元のまま残る', () => {
    const kept = [8, 9, 11, 12, 13, 14].filter((id) => original.has(id));
    assert.deepEqual(
      kept.map((id) => names.get(id)),
      kept.map((id) => original.get(id)),
    );
  });
});

describe.skipIf(skip)('ビルドした Zen Maru Gothic', () => {
  const fonts = skip
    ? []
    : readdirSync(built('assets')).filter((f) => /^zen-maru-gothic-\d+-.*\.woff2$/.test(f));

  test('太さ2つぶんのファイルがある', () => {
    assert.equal(fonts.length, 2);
  });

  for (const font of fonts)
    test(`${font} の name テーブルに OFL が書かれている`, () => {
      fontLicense(nameRecords(readFileSync(built(`assets/${font}`))));
    });
});

describe('dropWoffFallback', () => {
  test('WOFF2 もある src から WOFF の候補を外す', () => {
    const css =
      "@font-face{font-weight:500;src:url(./a.woff2) format('woff2'),url(./a.woff) format('woff');}";
    assert.equal(dropWoffFallback(css), "@font-face{font-weight:500;src:url(./a.woff2) format('woff2');}");
  });

  test('WOFF しかない src はそのまま残す', () => {
    const only = "@font-face{src:url(./a.woff) format('woff');}";
    assert.equal(dropWoffFallback(only), only);
  });
});

describe('isFontFile', () => {
  for (const [file, font] of [
    ['/x/zen-maru-gothic-10-500-normal.woff2', true],
    ['a.woff?v=1', true],
    ['/images/avatar.png', false],
  ] as const)
    test(`${file} は${font ? 'フォント' : 'フォントではない'}`, () => {
      assert.equal(isFontFile(file), font);
    });
});
