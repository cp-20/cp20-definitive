// The image cache: only decodable rasters of at most 15 MB enter it, a failed refresh keeps the
// previous file, only the images the pages show are kept, and the WebP copies (including the 16:9
// cut of the YouTube thumbnails) match what the committed cache and public/media hold.
import { afterAll, afterEach, beforeAll, describe, test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { clientMedia, type CacheEntry } from '../../src/content/media.ts';
import { sandbox, root } from './sandbox.ts';
import {
  dimensions,
  framedCrop,
  framedSources,
  iconPages,
  iconSources,
  plannedWidths,
  rasterExtension,
  shownItems,
  thumbnailSources,
  type addVariants,
  type cacheImages,
} from './images.ts';

type Images = { cacheImages: typeof cacheImages; addVariants: typeof addVariants };
const png = await readFile(join(root, 'public/images/avatar.png')); // 512px
const readJson = async (name: string) =>
  JSON.parse(await readFile(join(root, `src/data/${name}.json`), 'utf8'));
const exists = (path: string) =>
  readFile(path).then(
    () => true,
    () => false,
  );
// The files under public/ of `files` that are missing.
const missing = async (files: string[]) =>
  (await Promise.all(files.map(async (f) => ((await exists(join(root, 'public', f))) ? [] : [f])))).flat();
const offline = async () => new Response('busy', { status: 503 });
// Answers every fetch with `answer`, recording the URLs asked for.
function stubFetch(answer: (url: string) => Response) {
  const fetched: string[] = [];
  vi.stubGlobal('fetch', async (url: string | URL) => (fetched.push(String(url)), answer(String(url))));
  return fetched;
}
afterEach(() => {
  vi.unstubAllGlobals();
});

test('PNG はその拡張子で受け付ける', async () => {
  assert.equal(rasterExtension(png), 'png');
});

test('HTML は画像として受け付けない', () => {
  assert.throws(() => rasterExtension(Buffer.from('<html><script>alert(1)</script></html>')));
});

test('スクリプトを実行できる SVG は受け付けない', () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>';
  assert.throws(() => rasterExtension(Buffer.from(svg)));
});

describe('新しい OG 画像の受け入れ', () => {
  test('ラスター画像なら、幅と高さを返す', async () => {
    const size = await dimensions('https://example.com/a.png', async () => new Response(png));
    assert.deepEqual(Object.keys(size), ['width', 'height']);
  });

  for (const [why, url, response] of [
    [
      'SVG',
      'https://example.com/a.svg',
      () => new Response('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"></svg>'),
    ],
    [
      '15MB を超える画像',
      'https://example.com/huge.png',
      () => new Response(Buffer.concat([png, Buffer.alloc(15e6)])),
    ],
    ['エラーの応答', 'https://example.com/a.png', () => new Response('busy', { status: 503 })],
  ] as [string, string, () => Response][])
    test(`${why}は受け入れない`, async () => {
      await assert.rejects(dimensions(url, async () => response()));
    });
});

// A large noise PNG cut in half: image-size still reads a valid header, but decoding fails.
const noise = Buffer.alloc(2000 * 1000 * 3);
for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761) >>> 24;
const fullPng = await sharp(noise, { raw: { width: 2000, height: 1000, channels: 3 } })
  .png()
  .toBuffer();
const truncatedPng = fullPng.subarray(0, fullPng.length >> 1);

test('OG images with an intact header but a truncated body are rejected', async () => {
  await assert.rejects(dimensions('https://example.com/cut.png', async () => new Response(truncatedPng)));
});

test('a truncated image neither aborts the image cache nor enters it', async () => {
  const page = 'https://example.com/page';
  const good = 'https://example.com/good.png';
  const cut = 'https://example.com/cut.png';
  const box = await sandbox({
    previews: { [page]: { image: cut, icon: good, width: 2000, height: 1000 } },
    tracks: [],
    series: [],
    works: [{ url: page }],
  });
  try {
    const { cacheImages } = await box.importModule<Images>('images.ts');
    stubFetch((url) => new Response(url === cut ? truncatedPng : png));
    await cacheImages(false, {});
    assert.deepEqual(Object.keys(await box.load('image-cache')), [good]);
  } finally {
    await box.cleanup();
  }
});

test('a corrupt cached original keeps its entry without variants', async () => {
  const source = 'https://example.com/cut.png';
  const box = await sandbox({}, { 'cut.png': truncatedPng });
  try {
    const { addVariants } = await box.importModule<Images>('images.ts');
    const cache: Record<string, CacheEntry> = { [source]: { file: '/media/cut.png', checkedAt: 'now' } };
    assert.equal(await addVariants(cache, new Set([source])), 0);
    assert.equal(cache[source].variants, undefined);
    // No width either, so the snapshot tests (variants for every wide thumbnail) still pass.
    assert.equal(cache[source].width, undefined);
    assert.equal(await box.exists('public/media/cut-320w.webp.tmp'), false);
  } finally {
    await box.cleanup();
  }
});

test('when a new OG image cannot be cached, the previous image file and preview are kept', async () => {
  const page = 'https://example.com/work';
  const oldImage = 'https://example.com/og.png';
  const newImage = 'https://example.com/og-new.png';
  const before = { image: oldImage, icon: null, width: 1200, height: 600, checkedAt: '2000-01-01' };
  const box = await sandbox(
    {
      previews: { [page]: { ...before, image: newImage, width: 800, height: 400 } },
      tracks: [],
      series: [],
      'image-cache': { [oldImage]: { file: '/media/old.png', checkedAt: new Date().toISOString() } },
    },
    { 'old.png': png },
  );
  try {
    const { cacheImages } = await box.importModule<Images>('images.ts');
    vi.stubGlobal('fetch', offline);
    await cacheImages(false, { [page]: before });
    assert.equal(await box.exists('public/media/old.png'), true);
    assert.deepEqual(Object.keys(await box.load('image-cache')), [oldImage]);
    const kept = (await box.load('previews'))[page];
    assert.deepEqual([kept.image, kept.width, kept.height], [oldImage, 1200, 600]);
  } finally {
    await box.cleanup();
  }
});

test('a run that only adds or drops WebP variants reports a change (so it is built and deployed)', async () => {
  const page = 'https://example.com/work';
  const image = 'https://example.com/og.png';
  const box = await sandbox(
    {
      previews: { [page]: { image, icon: null, width: 512, height: 512, checkedAt: '2000-01-01' } },
      tracks: [],
      series: [],
      'image-cache': { [image]: { file: '/media/og.png', checkedAt: new Date().toISOString() } },
    },
    { 'og.png': png },
  );
  try {
    const { cacheImages } = await box.importModule<Images>('images.ts');
    vi.stubGlobal('fetch', offline);
    assert.equal(await cacheImages(false, {}), true, 'variants were added');
    const cached = (await box.load('image-cache'))[image];
    assert.ok(cached.variants?.length, 'the cache records the new variants');
    assert.equal(await cacheImages(false, {}), false, 'nothing changed');
    // The variants disappear from the manifest (e.g. a hand-edited or older cache): a change again.
    await writeFile(
      join(box.dir, 'src/data/image-cache.json'),
      JSON.stringify({ [image]: { file: cached.file, checkedAt: cached.checkedAt } }),
    );
    assert.equal(await cacheImages(false, {}), true, 'variants were restored');
  } finally {
    await box.cleanup();
  }
});

test('only the works keep their site icon: article platform logos are neither fetched nor kept', async () => {
  const work = 'https://example.com/work';
  const post = 'https://blog.example.com/post';
  const workIcon = 'https://example.com/icon.png';
  const logo = 'https://blog.example.com/logo.png';
  const box = await sandbox(
    {
      previews: {
        [work]: { image: null, icon: workIcon, width: 1200, height: 630 },
        [post]: { image: null, icon: logo, width: 1200, height: 630 },
      },
      tracks: [],
      series: [],
      works: [{ url: work }],
      'image-cache': { [logo]: { file: '/media/logo.png', checkedAt: new Date().toISOString() } },
    },
    { 'logo.png': png, 'logo-96w.webp': png },
  );
  try {
    const { cacheImages } = await box.importModule<Images>('images.ts');
    const fetched = stubFetch(() => new Response(png));
    await cacheImages(false, { [post]: { image: null, icon: logo, width: 1200, height: 630 } });
    assert.deepEqual(fetched, [workIcon]);
    assert.deepEqual(Object.keys(await box.load('image-cache')), [workIcon]);
    assert.equal(await box.exists('public/media/logo.png'), false);
    assert.equal(await box.exists('public/media/logo-96w.webp'), false);
  } finally {
    await box.cleanup();
  }
});

test('a series thumbnail hidden behind its volume 1 cover is neither fetched nor kept', async () => {
  const hidden = 'https://example.com/key-visual.png';
  const shown = 'https://example.com/uncovered.png';
  const box = await sandbox(
    {
      previews: {},
      tracks: [],
      series: [
        { title: '寿司ガキ', thumbnail: hidden },
        { title: 'no cover yet', thumbnail: shown },
      ],
      'image-cache': { [hidden]: { file: '/media/hidden.png', checkedAt: new Date().toISOString() } },
    },
    { 'hidden.png': png, 'hidden-320w.webp': png },
  );
  try {
    const { cacheImages } = await box.importModule<Images>('images.ts');
    const fetched = stubFetch(() => new Response(png));
    await cacheImages(false, {});
    assert.deepEqual(fetched, [shown]);
    assert.deepEqual(Object.keys(await box.load('image-cache')), [shown]);
    assert.equal(await box.exists('public/media/hidden.png'), false);
    assert.equal(await box.exists('public/media/hidden-320w.webp'), false);
  } finally {
    await box.cleanup();
  }
});

describe('plannedWidths', () => {
  for (const [width, planned] of [
    [1200, [320, 640, 960]],
    [1024, [320, 640]],
    [400, [320]],
    [300, []],
    [0, []],
  ] as [number, number[]][])
    test(`幅 ${width}px の画像には ${JSON.stringify(planned)} の縮小版を作る`, () => {
      assert.deepEqual(plannedWidths(width), planned);
    });
});

// addVariants run once on a copy of the scripts with four images: an OG thumbnail, an icon, a
// flat two-colour logo used as an icon, and one no longer used.
describe('addVariants', () => {
  let box: Awaited<ReturnType<typeof sandbox>>;
  const cache: Record<string, CacheEntry> = {
    'https://example.com/og.png': { file: '/media/og.png', checkedAt: 'x' },
    'https://example.com/icon.png': { file: '/media/icon.png', checkedAt: 'x' },
    'https://example.com/flat.png': { file: '/media/flat.png', checkedAt: 'x' },
    'https://example.com/unused.png': { file: '/media/unused.png', checkedAt: 'x', variants: [] },
  };
  beforeAll(async () => {
    const flat =
      '<svg xmlns="http://www.w3.org/2000/svg" width="315" height="315"><rect x="40" y="40" width="235" height="235" fill="#3ea8ff"/></svg>';
    box = await sandbox(
      {},
      {
        'og.png': png,
        'icon.png': png,
        'unused.png': png,
        'flat.png': await sharp(Buffer.from(flat))
          .png({ palette: true, colours: 2, compressionLevel: 9 })
          .toBuffer(),
      },
    );
    const { addVariants } = await box.importModule<Images>('images.ts');
    await addVariants(
      cache,
      new Set(['https://example.com/og.png']),
      new Set(['https://example.com/icon.png', 'https://example.com/flat.png']),
    );
  });
  afterAll(() => box.cleanup());

  test('サムネイルには、320px の WebP の縮小版を作って記録する', async () => {
    const meta = await sharp(join(box.dir, 'public/media/og-320w.webp')).metadata();
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
    const meta = await sharp(join(box.dir, 'public/media/icon-96w.webp')).metadata();
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
      [cache['https://example.com/flat.png'], await box.exists('public/media/flat-96w.webp')],
      [{ file: '/media/flat.png', checkedAt: 'x', width: 315 }, false],
    );
  });

  test('使われなくなった画像からは、縮小版の記録を外す', () => {
    assert.deepEqual(cache['https://example.com/unused.png'], { file: '/media/unused.png', checkedAt: 'x' });
  });
});

describe('コミットされた画像キャッシュ', async () => {
  const [cache, previews, tracks, series, works]: [
    Record<string, CacheEntry>,
    Record<string, { image: string | null; icon: string | null }>,
    { thumbnail: string }[],
    { title: string; thumbnail: string }[],
    { url: string }[],
  ] = await Promise.all([
    readJson('image-cache'),
    readJson('previews'),
    readJson('tracks'),
    readJson('series'),
    readJson('works'),
  ]);
  const entries = (sources: (string | null)[]) =>
    sources.flatMap((source) => (source && cache[source] ? [cache[source]] : []));
  const copies = (list: CacheEntry[]) => list.flatMap((e) => (e.variants ?? []).map((v) => v.file));

  test('幅 400px を超える OG 画像には、縮小版がそろっている', async () => {
    const wide = entries(Object.values(previews).map((p) => p.image)).filter(
      (e) => e.width! > 400 && !/\.(gif|ico)$/.test(e.file),
    );
    assert.deepEqual(
      wide.filter((e) => !e.variants?.length).map((e) => e.file),
      [],
    );
    assert.deepEqual(await missing(copies(wide)), []);
  });

  test('キャッシュした画像は、どれもページに表示されるもの', () => {
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
    const files = new Set(Object.values(cache).flatMap((e) => [e.file, ...copies([e])]));
    assert.deepEqual(
      (await readdir(join(root, 'public/media'))).filter((name) => !files.has(`/media/${name}`)),
      [],
    );
  });

  test('音楽と漫画のサムネイル、サイトアイコンは幅が記録され、縮小版がそろっている', async () => {
    const shown = entries([
      ...[...tracks, ...series].map((i) => i.thumbnail),
      ...Object.values(previews).map((p) => p.icon),
    ]).filter((e) => !/\.(gif|ico|svg)$/.test(e.file));
    assert.deepEqual(
      shown.filter((e) => !(e.width! > 0)).map((e) => e.file),
      [],
    );
    assert.deepEqual(await missing(copies(shown)), []);
  });

  test('幅 400px 以上の音楽と漫画のサムネイルには縮小版がある', () => {
    const wide = entries([...tracks, ...series].map((i) => i.thumbnail)).filter((e) => e.width! >= 400);
    assert.deepEqual(
      wide.filter((e) => !e.variants?.length).map((e) => e.file),
      [],
    );
  });

  // The pages show only the 16:9 picture cut out of the YouTube thumbnails' bands.
  describe('音楽のサムネイル', () => {
    const framed = framedSources(tracks);
    const { images } = clientMedia({}, cache, [...framed]);

    test('すべての曲のサムネイルを切り出しの対象にする', () => {
      assert.equal(framed.size, tracks.length);
    });

    for (const source of framed) {
      const { file, crop, variants } = cache[source];
      const largest = variants?.at(-1);
      test(`${file} は 16:9 の切り出しを記録している`, () => {
        assert.ok(crop && Math.abs(crop.width / crop.height - 16 / 9) < 0.01);
      });

      test(`${file} の元の 4:3 のファイルは候補に入れない`, () => {
        assert.equal(images[source].srcset?.includes(file), false);
      });

      test(`${file} の最大の候補は、切り出した全体`, () => {
        assert.deepEqual([images[source].src, largest?.width], [largest?.file, crop?.width]);
      });

      test(`${file} の表示するコピーの端には、黒や平らな帯が残っていない`, async () => {
        const { data, info } = await sharp(join(root, 'public', images[source].src))
          .greyscale()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const inside = framedCrop(data, info.width, info.height);
        assert.deepEqual([inside.width >= info.width - 2, inside.height >= info.height - 2], [true, true]);
      });
    }
  });
});

// YouTube thumbnails are 4:3 files around a 16:9 video, sometimes with the video's own black bars
// or pillars as well; the pages show only the 16:9 picture cut out of those bands.
/** A `width`×`height` greyscale image: noisy artwork inside the given bands of flat colour. */
type Bands = { top?: number; bottom?: number; left?: number; right?: number; band?: number };
function image(
  width: number,
  height: number,
  { top = 0, bottom = 0, left = 0, right = 0, band = 0 }: Bands = {},
) {
  const gray = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const inside = y >= top && y < height - bottom && x >= left && x < width - right;
      gray[y * width + x] = inside ? (x * 37 + y * 91) % 200 : band;
    }
  return gray;
}

describe('framedCrop', () => {
  for (const [why, bands, crop] of [
    [
      '普通の hqdefault は、上下の帯の間の 16:9 を切り出す',
      { top: 45, bottom: 45 },
      { left: 0, top: 45, width: 480, height: 270 },
    ],
    [
      'シネスコの動画は帯が深いぶん、左右を切って 16:9 にする',
      { top: 78, bottom: 76 },
      { left: 57, top: 78, width: 366, height: 206 },
    ],
    [
      '16:9 の枠に灰色の柱で入った 4:3 の動画は、柱も切る',
      { top: 45, bottom: 45, left: 104, right: 104, band: 60 },
      { left: 104, top: 103, width: 272, height: 153 },
    ],
    [
      '片側だけの平らな部分は柱ではなく絵の一部として残す',
      { top: 45, bottom: 45, right: 41 },
      { left: 0, top: 45, width: 480, height: 270 },
    ],
  ] as [string, Bands, object][])
    test(why, () => {
      assert.deepEqual(framedCrop(image(480, 360, bands), 480, 360), crop);
    });

  test('上端の細い線は、反対側になくても切る', () => {
    const line = framedCrop(image(480, 360, { top: 48, bottom: 45 }), 480, 360);
    assert.deepEqual([line.top >= 48, line.top + line.height <= 315], [true, true]);
  });

  test('切り出すのはいつも 16:9', () => {
    const line = framedCrop(image(480, 360, { top: 48, bottom: 45 }), 480, 360);
    assert.ok(Math.abs(line.width / line.height - 16 / 9) < 0.01);
  });
});
