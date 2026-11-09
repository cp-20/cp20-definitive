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
  boldRules,
  boldTexts,
  collectCharacters,
  dropWoffFallback,
  fontHead,
  isFontFile,
  slices,
  subsetOptions,
  unicodeRange,
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

test('fontHead は渡されたファイルを preload し、unicode-range を書く', () => {
  const head = fontHead(
    [{ weight: 700, href: '/assets/z-700-a.woff2', range: 'U+20-7e' }],
    ['/assets/z-700-a.woff2'],
  );
  assert.deepEqual(
    [
      head.startsWith(
        '<link rel="preload" href="/assets/z-700-a.woff2" as="font" type="font/woff2" crossorigin>',
      ),
      head.includes("format('woff2');unicode-range:U+20-7e}"),
    ],
    [true, true],
  );
});

test('unicodeRange は続いたコードポイントを1つの範囲にまとめる', () => {
  assert.equal(unicodeRange('xcab'), 'U+61-63,U+78');
});

test('slices はページごとに、それより前のページにない文字を分け、残りを最後に置く', () => {
  assert.deepEqual(slices('あいうえおか', ['あい', 'いう']), ['あい', 'う', 'えおか']);
});

describe('太字の文字', () => {
  const css =
    '@layer c{.title,.tab:hover{font-weight:700}.x:before{content:"賞"/"";font-weight:700}@media (width<9px){.y{font:700 1rem/1 a}}p{font-weight:500}}';

  test('boldRules は太字の規則のセレクタと、content の文字を拾う', () => {
    assert.deepEqual(boldRules(css), {
      selectors: ['.title', '.tab:hover', '.x:before', '.y'],
      content: ['賞'],
    });
  });

  const texts = boldTexts(
    ['<h2>見出し</h2><p class="title">題名</p><a class="tab">札</a><p class="x">本文</p><p>地の文</p>'],
    [css],
    ['"保存できませんでした"', '"地の文"'],
  ).join('');

  test('見出しと、太字の規則が当たる要素の文字を含む（ホバーしていなくても）', () => {
    assert.deepEqual(
      ['見', '題', '札', '賞'].filter((c) => !texts.includes(c)),
      [],
    );
  });

  test('疑似要素の規則では要素の本文を太字にしない', () => {
    assert.deepEqual(
      ['本', '地'].filter((c) => texts.includes(c)),
      [],
    );
  });

  test('ページになく、スクリプトだけが出す文字は含める', () => {
    assert.ok(texts.includes('保'));
  });
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

  // The @font-face rules every page declares: weight, file and unicode-range.
  const faces = skip
    ? []
    : [...readFileSync(built('index.html'), 'utf8').matchAll(/@font-face\{([^}]*)\}/g)].map(([, rule]) => ({
        weight: rule.match(/font-weight:(\d+)/)![1],
        href: rule.match(/url\(([^)]+)\)/)![1],
        range: rule.match(/unicode-range:([^;}]*)/)?.[1] ?? '',
      }));
  const points = (range: string) =>
    range.split(',').flatMap((r) => {
      const [a, b = a] = r.replace('U+', '').split('-');
      return Array.from({ length: parseInt(b, 16) - parseInt(a, 16) + 1 }, (_, i) => parseInt(a, 16) + i);
    });

  test('どのファイルも @font-face で宣言され、太さごとに文字の範囲が重ならない', () => {
    assert.deepEqual(faces.map((f) => f.href.slice('/assets/'.length)).sort(), [...fonts].sort());
    for (const weight of weights) {
      const all = faces.filter((f) => f.weight === String(weight)).flatMap((f) => points(f.range));
      assert.equal(new Set(all).size, all.length, `${weight}`);
    }
  });

  test('トップは太さごとに1つずつ、プロフィールは2つずつのファイルを preload する', () => {
    const preloads = (page: string) =>
      [...readFileSync(built(page), 'utf8').matchAll(/<link rel="preload" href="([^"]+)" as="font"/g)].map(
        ([, href]) => faces.find((f) => f.href === href)?.weight,
      );
    assert.deepEqual(
      [preloads('index.html').sort(), preloads('about/index.html').sort(), preloads('articles/index.html')],
      [['500', '700'], ['500', '500', '700', '700'], []],
    );
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
