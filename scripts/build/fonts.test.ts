// The web fonts the build ships: the subsets of Zen Maru Gothic, Yusei Magic and cp20 Mono (their characters, the @font-face
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
  handRules,
  monoRules,
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

test('fontHead は書体と太さごとに、1つの WOFF2 だけを指す @font-face を宣言する', () => {
  const head = fontHead([
    { weight: 500, href: '/assets/z-500-a.woff2' },
    { weight: 700, href: '/assets/z-700-b.woff2' },
    { family: 'Yusei Magic', weight: 400, href: '/assets/y-400-c.woff2' },
  ]);
  assert.deepEqual(
    [
      head.match(/@font-face/g)?.length,
      head.includes("font-weight:500;src:url(/assets/z-500-a.woff2) format('woff2')}"),
      head.includes("font-family:'Yusei Magic';font-style:normal;font-display:swap;font-weight:400;"),
    ],
    [3, true, true],
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

describe('太字と手書きの文字', () => {
  const css =
    '@layer c{.title,.tab:hover{font-weight:700}.x:before{content:"賞"/"";font-weight:700}@media (width<9px){.y{font:700 1rem/1 a}}p{font-weight:500}.hand,.count strong{font-family:var(--hand);font-weight:400}.repo{font-family:var(--mono)}}';

  test('boldRules は太字の規則のセレクタと、content の文字を拾う', () => {
    assert.deepEqual(boldRules(css), {
      selectors: ['.title', '.tab:hover', '.x:before', '.y'],
      content: ['賞'],
    });
  });

  test('handRules は var(--hand) を、monoRules は var(--mono) を指定した規則のセレクタを拾う', () => {
    assert.deepEqual(
      [handRules(css).selectors, monoRules(css).selectors],
      [['.hand', '.count strong'], ['.repo']],
    );
  });

  const page =
    '<h2>見出し</h2><p class="title">題名</p><a class="tab">札</a><p class="x">本文</p><p>地の文</p><strong>強</strong><p class="count"><strong>数</strong></p><span class="hand">手</span><span class="repo">cp-20/éx</span>';
  const bold = boldTexts([page], [css], ['"保存できませんでした"', '"地の文"']).join('');
  const hand = boldTexts([page], [css], [], 'hand').join('');
  const mono = boldTexts([page], [css], [], 'mono').join('');

  test('太字には strong と、太字の規則が当たる要素の文字が入る（ホバーしていなくても）', () => {
    assert.deepEqual(
      ['題', '札', '賞', '強'].filter((c) => !bold.includes(c)),
      [],
    );
  });

  test('疑似要素の規則では要素の本文を太字にしない。見出しと、規則で並の太さに戻した strong も入れない', () => {
    assert.deepEqual(
      ['本', '地', '見', '数'].filter((c) => bold.includes(c)),
      [],
    );
  });

  test('ページになく、スクリプトだけが出す文字は含める', () => {
    assert.ok(bold.includes('保'));
  });

  test('手書きには見出しと、手書きの規則が当たる要素の文字が入る', () => {
    assert.deepEqual(
      ['見', '数', '手'].filter((c) => !hand.includes(c)),
      [],
    );
    assert.ok(!hand.includes('題'));
  });

  test('等幅には等幅の規則が当たる要素の文字だけが入る（見出しも strong も入れない）', () => {
    assert.deepEqual([mono.includes('é'), ['見', '強', '手'].filter((c) => mono.includes(c))], [true, []]);
  });

  test('generated: false では疑似要素の文字を入れない（ページが自分で見せる文字だけ）', () => {
    assert.ok(!boldTexts([page], [css], [], 'bold', { generated: false }).join('').includes('賞'));
  });
});

describe.each([
  'zen-maru-gothic/zen-maru-gothic-700.woff2',
  'yusei-magic/yusei-magic-400.woff2',
  'cp20-mono/cp20-mono-600.woff2',
])('%s の絞り込み', (file) => {
  test('絞り込んでも、著作権・デザイナー・ライセンスの name レコードは元のまま残る（OFL の条件）', async () => {
    const source = readFileSync(join(root, 'fonts', file));
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

// "Plex" is IBM Plex's Reserved Font Name: a Modified Version (a subset) may not be named with it.
test('cp20 Mono は絞り込んでも、書体の名前に IBM Plex の予約名「Plex」を使わない', async () => {
  const source = readFileSync(join(root, 'fonts', 'cp20-mono/cp20-mono-600.woff2'));
  const names = nameRecords(await subsetFont(source, 'a', subsetOptions));
  assert.deepEqual(
    [1, 3, 4, 6, 16, 17].map((id) => names.get(id) ?? '').filter((name) => /plex/i.test(name)),
    [],
  );
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
