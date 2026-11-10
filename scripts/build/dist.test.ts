// What the build publishes in dist/client: the pages' heads and headings for crawlers, the picture
// of a shared link, the fonts and the notices their licenses require, and nothing only for the
// build. Skipped until `npm run build` has run; `npm run verify` runs it after the build.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import sharp from 'sharp';
import baseWorks from '../../src/data/works.json' with { type: 'json' };
import manual from '../../src/data/manual.json' with { type: 'json' };
import series from '../../src/data/series.json' with { type: 'json' };
import { OG_IMAGE, mergeWorks, sitePaths } from '../../src/site/pages.ts';
import { spineAuthor } from '../../src/content/series-credit.ts';
import { faceName, faces } from './fonts.ts';
import { licensesPath } from './licenses.ts';
import { assertOflNotice, nameRecords } from './font-names.ts';

const built = (path: string) => new URL(`../../dist/client/${path}`, import.meta.url);
const read = (path: string) => readFileSync(built(path), 'utf8');
const pageFile = (path: string) => (path === '/' ? 'index.html' : `${path.slice(1)}/index.html`);
const head = (file: string) => read(file).split('</head>')[0];

describe.skipIf(!existsSync(built('404.html')))('ビルド結果', () => {
  test('トップは正規 URL を名乗って検索エンジンに載せ、404 は載せないよう求めて正規 URL を名乗らない', () => {
    const indexing = (file: string) => {
      const h = head(file);
      return {
        canonical: h.match(/<link\b[^>]*rel="canonical" href="([^"]+)"/)?.[1],
        ogUrl: /property="og:url"/.test(h),
        noindex: /<meta\b[^>]*name="robots" content="noindex"/.test(h),
      };
    };
    assert.deepEqual(
      [indexing('index.html'), indexing('404.html')],
      [
        { canonical: 'https://cp20.dev/', ogUrl: true, noindex: false },
        { canonical: undefined, ogUrl: false, noindex: true },
      ],
    );
  });

  // The headings outside <template>, without their markup.
  const headings = (html: string) =>
    [
      ...html.replace(/<template[\s\S]*?<\/template>/g, '').matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/g),
    ].map(([, level, text]) => ({ level: +level, text: text.replace(/<[^>]+>|<!--.*?-->/g, '').trim() }));

  test('どのページの見出しも、レベルを飛ばさない', () => {
    const files = [...sitePaths(mergeWorks(baseWorks, manual)).map(pageFile), '404.html'];
    const skipped = files.flatMap((file) =>
      headings(read(file))
        .filter((h, i, all) => h.level > (i ? all[i - 1].level : 0) + 1)
        .map((h) => `${file}: h${h.level} ${h.text}`),
    );
    assert.deepEqual(skipped, []);
  });

  test('/ と /about の h1 は別の文で、/about のものはプロフィールを名乗る', () => {
    const h1 = (file: string) => headings(read(file)).find((h) => h.level === 1)?.text;
    assert.deepEqual(
      [h1('index.html') !== h1('about/index.html'), h1('about/index.html')?.includes('プロフィール')],
      [true, true],
    );
  });

  test('共有したリンクの画像は、ページが告げる大きさの PNG', async () => {
    const { format, width, height } = await sharp(built(OG_IMAGE.path.slice(1)).pathname).metadata();
    assert.deepEqual(
      { format, width, height },
      { format: 'png', width: OG_IMAGE.width, height: OG_IMAGE.height },
    );
  });

  test('本棚の本の名前には原作・原案まで全員を、背表紙には最初の名前だけを書く', () => {
    const about = read('about/index.html');
    assert.deepEqual(
      series.filter(
        (s) =>
          !about.includes(`aria-label="${s.title} ${s.author}"`) ||
          !about.includes(`<small>${spineAuthor(s.author)}</small>`),
      ),
      [],
    );
  });

  test('ビルド用のマニフェストは公開しない', () => {
    assert.equal(existsSync(built('.vite')), false);
  });

  describe('フォント', () => {
    const fonts = () =>
      readdirSync(built('assets')).filter((f) => faces.some((face) => f.startsWith(`${faceName(face)}-`)));
    // The @font-face rules every page declares: face, file and unicode-range.
    const declared = () =>
      [...read('index.html').matchAll(/@font-face\{([^}]*)\}/g)].map(([, rule]) => ({
        face: faceName({
          family: rule.match(/font-family:'([^']+)'/)![1] as (typeof faces)[number]['family'],
          weight: Number(rule.match(/font-weight:(\d+)/)![1]) as (typeof faces)[number]['weight'],
        }),
        href: rule.match(/url\(([^)]+)\)/)![1],
        range: rule.match(/unicode-range:([^;}]*)/)?.[1] ?? '',
      }));
    const points = (range: string) =>
      range.split(',').flatMap((r) => {
        const [a, b = a] = r.replace('U+', '').split('-');
        return Array.from({ length: parseInt(b, 16) - parseInt(a, 16) + 1 }, (_, i) => parseInt(a, 16) + i);
      });

    test('どのファイルも @font-face で宣言され、書体と太さごとに文字の範囲が重ならない', () => {
      assert.deepEqual(
        declared()
          .map((f) => f.href.slice('/assets/'.length))
          .sort(),
        fonts().sort(),
      );
      for (const face of faces.map(faceName)) {
        const all = declared()
          .filter((f) => f.face === face)
          .flatMap((f) => points(f.range));
        assert.equal(new Set(all).size, all.length, face);
      }
    });

    test('トップとプロフィールは、自分が見せる書体と文字のファイルだけを preload する（ほかのページはしない）', () => {
      const preloads = (file: string) =>
        [...read(file).matchAll(/<link rel="preload" href="([^"]+)" as="font"/g)].map(
          ([, href]) => declared().find((f) => f.href === href)?.face,
        );
      assert.deepEqual(
        [preloads('index.html').sort(), preloads('about/index.html').sort(), preloads('articles/index.html')],
        [
          ['yusei-magic-400', 'zen-maru-gothic-700'],
          ['yusei-magic-400', 'yusei-magic-400', 'zen-maru-gothic-700', 'zen-maru-gothic-700'],
          [],
        ],
      );
    });

    test('どのファイルの name テーブルにも著作権と OFL が書かれている', () => {
      for (const font of fonts()) assertOflNotice(nameRecords(readFileSync(built(`assets/${font}`))));
    });
  });

  describe('ライセンス表示', () => {
    test('第三者ライセンスの一覧は、同梱した npm パッケージ・フォント・シールの絵柄とその本文を載せる', () => {
      const text = read(licensesPath);
      const needles = [
        /^@firebase\/app@\S+ \(Apache-2\.0\)/m,
        /^firebase@\S+ \(Apache-2\.0\)/m,
        /^solid-js@\S+ \(MIT\)/m,
        /^@solidjs\/web@\S+ \(MIT\)/m,
        /^lucide@\S+ \(ISC\)/m,
        /Copyright \(c\) 2013-present Cole Bemis/,
        /^@fontsource\/ibm-plex-mono@\S+ \(OFL-1\.1\)/m,
        /^Zen Maru Gothic .*\(OFL-1\.1\)/m,
        /^Yusei Magic .*\(OFL-1\.1\)/m,
        /^Twemoji graphics .*\(CC-BY-4\.0\).*\n-+\nCopyright 2019 Twitter, Inc and other contributors/m,
        /Apache License\s+Version 2\.0/,
        /SIL OPEN FONT LICENSE Version 1\.1/,
      ];
      assert.deepEqual(needles.filter((needle) => !needle.test(text)).map(String), []);
      assert.ok(existsSync(built('stamps/LICENSE-GRAPHICS.txt')));
    });

    test('クレジットのダイアログは、一覧とシールの絵柄のライセンスへのリンク、絵柄の著作権者を載せる', () => {
      const html = read('index.html');
      const start = html.indexOf('id="credits"');
      const credits = html.slice(start, html.indexOf('</dialog>', start));
      assert.deepEqual(
        [
          `href="/${licensesPath}"`,
          'href="/stamps/LICENSE-GRAPHICS.txt"',
          '© Twitter, Inc and other contributors',
        ].filter((needle) => !credits.includes(needle)),
        [],
      );
    });
  });
});
