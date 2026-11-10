// The web fonts the build ships: the subset of Zen Maru Gothic (its characters, the @font-face
// rules, and the copyright and license records it must keep under the SIL OFL) and the filter
// that drops the WOFF fallbacks from the other @fontsource stylesheets. The built fonts are
// checked in dist.test.ts.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
} from './fonts.ts';
import { assertOflNotice, nameRecords } from './font-names.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));

describe('collectCharacters', () => {
  const collect = () => collectCharacters(['あ', '"\\u3044\\u{1F600}"', '<p>&#x3046;&#12360;</p>', '\u0007']);

  test('そのままの文字、\\u エスケープ、文字参照、印字可能な ASCII を含める', () => {
    const chars = collect();
    assert.deepEqual(
      ['あ', 'い', '😀', 'う', 'え', 'A'].filter((c) => !chars.includes(c)),
      [],
    );
  });

  test('制御文字は含めない', () => {
    assert.ok(!collect().includes('\u0007'));
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

describe('Zen Maru Gothic の絞り込み', () => {
  test('絞り込んでも、著作権・デザイナー・ライセンスの name レコードは元のまま残る（OFL の条件）', async () => {
    const source = readFileSync(join(root, 'fonts/zen-maru-gothic/zen-maru-gothic-500.woff2'));
    const original = nameRecords(source);
    const names = nameRecords(await subsetFont(source, 'あa', subsetOptions));
    const kept = [0, 8, 9, 11, 12, 13, 14].filter((id) => original.has(id));
    assert.deepEqual(
      kept.map((id) => names.get(id)),
      kept.map((id) => original.get(id)),
    );
    assertOflNotice(names);
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
