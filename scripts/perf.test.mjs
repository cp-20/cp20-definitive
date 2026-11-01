// Page weight: thumbnail variants, the client media table and font subsetting.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { access, cp, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import subsetFont from 'subset-font';
import {
  iconPages,
  iconSources,
  isVariantFile,
  plannedWidths,
  shownItems,
  thumbnailSources,
  variantFile,
} from './image-variants.mjs';
import { collectCharacters, fontHead, weights } from './fonts.mjs';
import { clientMedia, coverSrcsets } from '../src/data/client-media.mjs';
import { mangaCovers } from '../src/data/manga-covers.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFile(join(root, path), 'utf8');
const readJson = async (name) => JSON.parse(await read(`src/data/${name}.json`));
const exists = (path) =>
  access(path)
    .then(() => true)
    .catch(() => false);
// The files under public/ of `entries` that are missing.
const missing = async (files) =>
  (await Promise.all(files.map(async (f) => ((await exists(join(root, 'public', f))) ? [] : [f])))).flat();

describe('plannedWidths', () => {
  for (const [width, planned] of [
    [1200, [320, 640, 960]],
    [1024, [320, 640]],
    [400, [320]],
    [300, []],
    [0, []],
  ])
    test(`幅 ${width}px の画像には ${JSON.stringify(planned)} の縮小版を作る`, () => {
      assert.deepEqual(plannedWidths(width), planned);
    });
});

test('縮小版のファイル名は元の名前に幅をつけた WebP', () => {
  assert.equal(variantFile('/media/abc.png', 320), '/media/abc-320w.webp');
});

test('縮小版のファイル名だけを縮小版と判定する', () => {
  assert.deepEqual([isVariantFile('/media/abc-320w.webp'), isVariantFile('/media/abc.png')], [true, false]);
});

// addVariants run once on a copy of the scripts with four images: an OG thumbnail, an icon, a
// flat two-colour logo used as an icon, and one no longer used.
describe('addVariants', () => {
  let dir;
  const cache = {
    'https://example.com/og.png': { file: '/media/og.png', checkedAt: 'x' },
    'https://example.com/icon.png': { file: '/media/icon.png', checkedAt: 'x' },
    'https://example.com/flat.png': { file: '/media/flat.png', checkedAt: 'x' },
    'https://example.com/unused.png': { file: '/media/unused.png', checkedAt: 'x', variants: [] },
  };
  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cp20-variants-'));
    await cp(join(root, 'scripts'), join(dir, 'scripts'), { recursive: true });
    await mkdir(join(dir, 'src/data'), { recursive: true });
    for (const file of ['variant-names.mjs', 'manga-covers.mjs'])
      await cp(join(root, 'src/data', file), join(dir, 'src/data', file));
    await symlink(join(root, 'node_modules'), join(dir, 'node_modules'));
    await mkdir(join(dir, 'public/media'), { recursive: true });
    const png = await readFile(join(root, 'public/images/avatar.png')); // 512px
    for (const name of ['og', 'icon', 'unused']) await writeFile(join(dir, `public/media/${name}.png`), png);
    const flat =
      '<svg xmlns="http://www.w3.org/2000/svg" width="315" height="315"><rect x="40" y="40" width="235" height="235" fill="#3ea8ff"/></svg>';
    await writeFile(
      join(dir, 'public/media/flat.png'),
      await sharp(Buffer.from(flat)).png({ palette: true, colours: 2, compressionLevel: 9 }).toBuffer(),
    );
    const { addVariants } = await import(pathToFileURL(join(dir, 'scripts/image-variants.mjs')).href);
    await addVariants(
      cache,
      new Set(['https://example.com/og.png']),
      new Set(['https://example.com/icon.png', 'https://example.com/flat.png']),
    );
  });
  after(() => rm(dir, { recursive: true, force: true }));

  test('サムネイルには、320px の WebP の縮小版を作って記録する', async () => {
    const meta = await sharp(join(dir, 'public/media/og-320w.webp')).metadata();
    assert.deepEqual(
      [cache['https://example.com/og.png'], [meta.format, meta.width, meta.height]],
      [
        {
          file: '/media/og.png',
          checkedAt: 'x',
          width: 512,
          variants: [{ file: '/media/og-320w.webp', width: 320 }],
        },
        ['webp', 320, 320],
      ],
    );
  });

  test('アイコンには、96px の WebP の縮小版を作って記録する', async () => {
    const meta = await sharp(join(dir, 'public/media/icon-96w.webp')).metadata();
    assert.deepEqual(
      [cache['https://example.com/icon.png'], [meta.format, meta.width]],
      [
        {
          file: '/media/icon.png',
          checkedAt: 'x',
          width: 512,
          variants: [{ file: '/media/icon-96w.webp', width: 96 }],
        },
        ['webp', 96],
      ],
    );
  });

  test('PNG のほうが小さい平坦なロゴには、縮小版を作らない', async () => {
    assert.deepEqual(
      [cache['https://example.com/flat.png'], await exists(join(dir, 'public/media/flat-96w.webp'))],
      [{ file: '/media/flat.png', checkedAt: 'x', width: 315 }, false],
    );
  });

  test('使われなくなった画像からは、縮小版の記録を外す', () => {
    assert.deepEqual(cache['https://example.com/unused.png'], { file: '/media/unused.png', checkedAt: 'x' });
  });
});

describe('コミットされた画像キャッシュ', () => {
  test('幅 400px を超える OG 画像には、縮小版がそろっている', async () => {
    const [cache, previews] = await Promise.all([readJson('image-cache'), readJson('previews')]);
    const wide = Object.values(previews)
      .map(({ image }) => image && cache[image])
      .filter((entry) => entry && entry.width > 400 && !/\.(gif|ico)$/.test(entry.file));
    assert.deepEqual(
      wide.filter((entry) => !entry.variants?.length).map((entry) => entry.file),
      [],
    );
    assert.deepEqual(await missing(wide.flatMap((entry) => entry.variants.map((v) => v.file))), []);
  });

  test('キャッシュした画像は、どれもページに表示されるもの', async () => {
    const [cache, previews, tracks, series, works] = await Promise.all(
      ['image-cache', 'previews', 'tracks', 'series', 'works'].map(readJson),
    );
    const shown = new Set([
      ...thumbnailSources(previews, shownItems(tracks, series)),
      ...iconSources(previews, iconPages(works)),
    ]);
    assert.deepEqual(
      Object.keys(cache).filter((source) => !shown.has(source)),
      [],
    );
  });

  test('public/media のファイルは、どれも画像キャッシュに載っている', async () => {
    const cache = await readJson('image-cache');
    const files = new Set(
      Object.values(cache).flatMap((e) => [e.file, ...(e.variants ?? []).map((v) => v.file)]),
    );
    const names = await readdir(join(root, 'public/media'));
    assert.deepEqual(
      names.filter((name) => !files.has(`/media/${name}`)),
      [],
    );
  });

  test('音楽と漫画のサムネイル、サイトアイコンは幅が記録され、縮小版がそろっている', async () => {
    const [cache, previews, tracks, series] = await Promise.all(
      ['image-cache', 'previews', 'tracks', 'series'].map(readJson),
    );
    const sources = [...tracks, ...series]
      .map((i) => i.thumbnail)
      .concat(Object.values(previews).map((p) => p.icon));
    const entries = sources
      .map((source) => source && cache[source])
      .filter((e) => e && !/\.(gif|ico|svg)$/.test(e.file));
    assert.deepEqual(
      entries.filter((e) => !(e.width > 0)).map((e) => e.file),
      [],
    );
    assert.deepEqual(await missing(entries.flatMap((e) => (e.variants ?? []).map((v) => v.file))), []);
  });

  test('幅 400px 以上の音楽と漫画のサムネイルには縮小版がある', async () => {
    const [cache, tracks, series] = await Promise.all(['image-cache', 'tracks', 'series'].map(readJson));
    const wide = [...tracks, ...series].map((i) => cache[i.thumbnail]).filter((e) => e?.width >= 400);
    assert.deepEqual(
      wide.filter((e) => !e.variants?.length).map((e) => e.file),
      [],
    );
  });
});

describe('漫画の表紙', () => {
  const srcsets = readdir(join(root, 'public/images/covers')).then(coverSrcsets);
  const candidates = async (image) => (await srcsets)[image]?.split(', ').map((c) => c.split(' ')) ?? [];
  for (const { image } of Object.values(mangaCovers)) {
    test(`${image} の最大の候補は、元の表紙と同じ幅`, async () => {
      const { width } = await sharp(join(root, 'public', image)).metadata();
      assert.equal((await candidates(image)).at(-1)?.[1], `${width}w`);
    });

    test(`${image} の WebP の候補は、srcset に書いた幅のとおり`, async () => {
      const copies = (await candidates(image)).filter(([file]) => file.endsWith('.webp'));
      const actual = await Promise.all(
        copies.map(async ([file]) => `${(await sharp(join(root, 'public', file)).metadata()).width}w`),
      );
      assert.deepEqual(
        actual,
        copies.map(([, descriptor]) => descriptor),
      );
    });
  }

  test('srcset は元の画像と同じ名前の WebP だけから作る', () => {
    assert.deepEqual(
      coverSrcsets(['a.jpg', 'a-240w.webp', 'a-480w.webp', 'a-b.jpg', 'b.png', 'notes.txt'], '/c/'),
      { '/c/a.jpg': '/c/a-240w.webp 240w, /c/a-480w.webp 480w' },
    );
  });
});

describe('clientMedia', () => {
  const page = 'https://example.com/post';
  const { pages, images } = clientMedia(
    {
      [page]: {
        image: 'https://cdn.example.com/og.png?x=1',
        icon: 'https://cdn.example.com/icon.png',
        width: 1200,
        height: 630,
        checkedAt: '2026-01-01',
      },
      'https://example.com/none': { image: null, icon: null, width: 1200, height: 630, checkedAt: 'x' },
    },
    {
      'https://cdn.example.com/og.png?x=1': {
        file: '/media/og.png',
        checkedAt: 'x',
        width: 1200,
        variants: [
          { file: '/media/og-320w.webp', width: 320 },
          { file: '/media/og-640w.webp', width: 640 },
        ],
      },
      'https://cdn.example.com/icon.png': {
        file: '/media/icon.png',
        checkedAt: 'x',
        width: 180,
        variants: [{ file: '/media/icon-96w.webp', width: 96 }],
      },
      'https://i.ytimg.com/vi/a/hq.jpg': {
        file: '/media/yt.jpg',
        checkedAt: 'x',
        width: 480,
        variants: [{ file: '/media/yt-320w.webp', width: 320 }],
      },
      'https://i.ytimg.com/vi/b/hq.jpg': { file: '/media/yt-b.jpg', checkedAt: 'x' },
      'https://unused.example.com/a.png': { file: '/media/unused.png', checkedAt: 'x' },
    },
    ['https://i.ytimg.com/vi/a/hq.jpg', 'https://i.ytimg.com/vi/b/hq.jpg', null],
  );

  test('ページの画像は、ローカルのパスと srcset とサイズにする', () => {
    assert.deepEqual(pages[page], {
      width: 1200,
      height: 630,
      image: '/media/og.png',
      srcset: '/media/og-320w.webp 320w, /media/og-640w.webp 640w, /media/og.png 1200w',
      icon: '/media/icon-96w.webp',
    });
  });

  test('画像のないページは、サイズだけを持つ', () => {
    assert.deepEqual(pages['https://example.com/none'], { width: 1200, height: 630 });
  });

  test('ページ以外の画像は、使われているものだけを src と srcset にする', () => {
    assert.deepEqual(images, {
      'https://i.ytimg.com/vi/a/hq.jpg': {
        src: '/media/yt.jpg',
        srcset: '/media/yt-320w.webp 320w, /media/yt.jpg 480w',
      },
      'https://i.ytimg.com/vi/b/hq.jpg': { src: '/media/yt-b.jpg' },
    });
  });

  test('確認日時や元の URL は、クライアントに送らない', () => {
    const serialized = JSON.stringify({ pages, images });
    assert.deepEqual(
      [serialized.includes('checkedAt'), serialized.includes('cdn.example.com')],
      [false, false],
    );
  });
});

describe('collectCharacters', () => {
  const chars = collectCharacters(['あ', '"\\u3044\\u{1F600}"', '<p>&#x3046;&#12360;</p>', '\u0007']);
  for (const [c, why] of [
    ['あ', 'そのままの文字'],
    ['い', '\\u エスケープ'],
    ['😀', '\\u{} エスケープ'],
    ['う', '16進の文字参照'],
    ['え', '10進の文字参照'],
    ['A', '印字可能な ASCII'],
  ])
    test(`${why}の文字を含める`, () => {
      assert.ok(chars.includes(c));
    });

  test('制御文字は含めない', () => {
    assert.ok(!chars.includes('\u0007'));
  });
});

describe('fontHead', () => {
  const head = fontHead([
    { weight: 500, href: '/assets/z-500-a.woff2' },
    { weight: 700, href: '/assets/z-700-b.woff2' },
  ]);
  test('太さごとに @font-face を1つずつ宣言する', () => {
    assert.equal(head.match(/@font-face/g).length, 2);
  });

  test('各太さは1つの WOFF2 ファイルを指す', () => {
    assert.ok(head.includes("font-weight:500;src:url(/assets/z-500-a.woff2) format('woff2')"));
  });

  test('unicode-range も WOFF の代替も書かない', () => {
    assert.deepEqual([head.includes('unicode-range'), head.includes("format('woff')")], [false, false]);
  });
});

for (const weight of weights)
  test(`同梱した Zen Maru Gothic ${weight} は、小さな WOFF2 に絞り込める`, async () => {
    const full = await readFile(join(root, `fonts/zen-maru-gothic/zen-maru-gothic-${weight}.woff2`));
    const subset = await subsetFont(full, 'しーぴーのスタンプ帳cp20', { targetFormat: 'woff2' });
    assert.deepEqual([subset.subarray(0, 4).toString('latin1'), subset.length < 20_000], ['wOF2', true]);
  });
