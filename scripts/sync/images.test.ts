// The image cache: only decodable rasters of at most 15 MB enter it, a failed refresh keeps the
// previous file, only the images the pages show are kept, and the WebP copies (including the 16:9
// cut of the YouTube thumbnails). What the committed cache holds is checked in src/data/snapshot.test.ts.
import { afterAll, beforeAll, describe, onTestFinished, test } from 'vitest';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import type { CacheEntry } from '../../src/content/media.ts';
import { addVariants, cacheImages, downloadRaster, framedCrop, plannedWidths } from './images.ts';
import { tempDirs } from './temp-dirs.ts';

const png = await readFile(new URL('../../public/images/avatar.png', import.meta.url)); // 512×512
// A large noise PNG cut in half: image-size still reads a valid header, but decoding fails.
const noise = Buffer.alloc(800 * 400 * 3);
for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761) >>> 24;
const fullPng = await sharp(noise, { raw: { width: 800, height: 400, channels: 3 } })
  .png()
  .toBuffer();
const truncatedPng = fullPng.subarray(0, fullPng.length >> 1);

// A fetch that answers every URL with `answer`, recording the URLs asked for.
function fetchOf(answer: (url: string) => Response) {
  const fetched: string[] = [];
  const fetch = (async (url: string | URL) => {
    fetched.push(String(url));
    return answer(String(url));
  }) as typeof globalThis.fetch;
  return { fetch, fetched };
}
const offline = fetchOf(() => new Response('busy', { status: 503 })).fetch;
const fresh = () => new Date().toISOString();
// Temporary data and media directories, removed after the test.
async function dirsWith(...args: Parameters<typeof tempDirs>) {
  const box = await tempDirs(...args);
  onTestFinished(box.cleanup);
  return box;
}

describe('キャッシュに入れる画像', () => {
  test('ラスター画像なら、その中身と拡張子を返す', async () => {
    const { bytes, ext } = await downloadRaster(
      'https://example.com/a',
      fetchOf(() => new Response(png)).fetch,
    );
    assert.deepEqual([bytes.equals(png), ext], [true, 'png']);
  });

  for (const [why, answer] of [
    ['SVG', () => new Response('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"></svg>')],
    ['スクリプト入りの HTML', () => new Response('<html><script>alert(1)</script></html>')],
    ['15MB を超える画像', () => new Response(Buffer.concat([png, Buffer.alloc(15e6)]))],
    ['エラーの応答', () => new Response('busy', { status: 503 })],
    ['ヘッダーは正しいが本体が途中で切れた PNG', () => new Response(truncatedPng)],
  ] as [string, () => Response][])
    test(`${why}は受け入れない`, async () => {
      await assert.rejects(downloadRaster('https://example.com/a', fetchOf(answer).fetch));
    });
});

describe('cacheImages', () => {
  test('途中で切れた画像があっても止まらず、その画像はキャッシュに入れない', async () => {
    const page = 'https://example.com/page';
    const good = 'https://example.com/good.png';
    const cut = 'https://example.com/cut.png';
    const box = await dirsWith({
      previews: { [page]: { image: cut, icon: good, width: 2000, height: 1000 } },
      tracks: [],
      series: [],
      works: [{ url: page }],
    });
    const { fetch } = fetchOf((url) => new Response(url === cut ? truncatedPng : png));
    await cacheImages({ previousPreviews: {}, dirs: box.dirs, fetch });
    assert.deepEqual(Object.keys(await box.load('image-cache')), [good]);
  });

  test('新しい OG 画像をキャッシュできなければ、前の画像のファイルとプレビューを残す', async () => {
    const page = 'https://example.com/work';
    const oldImage = 'https://example.com/og.png';
    const before = { image: oldImage, icon: null, width: 1200, height: 600, checkedAt: '2000-01-01' };
    const box = await dirsWith(
      {
        previews: { [page]: { ...before, image: 'https://example.com/og-new.png', width: 800, height: 400 } },
        tracks: [],
        series: [],
        'image-cache': { [oldImage]: { file: '/media/old.png', checkedAt: fresh() } },
      },
      { 'old.png': png },
    );
    await cacheImages({ previousPreviews: { [page]: before }, dirs: box.dirs, fetch: offline });
    const kept = (await box.load('previews'))[page];
    assert.equal(await box.exists('/media/old.png'), true);
    assert.deepEqual(Object.keys(await box.load('image-cache')), [oldImage]);
    assert.deepEqual([kept.image, kept.width, kept.height], [oldImage, 1200, 600]);
  });

  test('縮小版を足すか外すだけの実行も変化として報告する（ビルドして公開されるように）', async () => {
    const page = 'https://example.com/work';
    const image = 'https://example.com/og.png';
    const box = await dirsWith(
      {
        previews: { [page]: { image, icon: null, width: 512, height: 512, checkedAt: '2000-01-01' } },
        tracks: [],
        series: [],
        'image-cache': { [image]: { file: '/media/og.png', checkedAt: fresh() } },
      },
      { 'og.png': png },
    );
    const run = () => cacheImages({ previousPreviews: {}, dirs: box.dirs, fetch: offline });
    assert.equal(await run(), true, '縮小版を足した');
    const cached = (await box.load('image-cache'))[image];
    assert.ok(cached.variants?.length, 'キャッシュに縮小版が記録される');
    assert.equal(await run(), false, '何も変わらない');
    // The variants disappear from the manifest (a hand-edited or older cache): a change again.
    await box.write('image-cache', { [image]: { file: cached.file, checkedAt: cached.checkedAt } });
    assert.equal(await run(), true, '縮小版を戻した');
  });

  test('サイトアイコンは作品のものだけを取得して残し、記事の掲載先のロゴは消す', async () => {
    const work = 'https://example.com/work';
    const post = 'https://blog.example.com/post';
    const workIcon = 'https://example.com/icon.png';
    const logo = 'https://blog.example.com/logo.png';
    const box = await dirsWith(
      {
        previews: {
          [work]: { image: null, icon: workIcon, width: 1200, height: 630 },
          [post]: { image: null, icon: logo, width: 1200, height: 630 },
        },
        tracks: [],
        series: [],
        works: [{ url: work }],
        'image-cache': { [logo]: { file: '/media/logo.png', checkedAt: fresh() } },
      },
      { 'logo.png': png, 'logo-96w.webp': png },
    );
    const { fetch, fetched } = fetchOf(() => new Response(png));
    await cacheImages({
      previousPreviews: { [post]: { image: null, icon: logo, width: 1200, height: 630 } },
      dirs: box.dirs,
      fetch,
    });
    assert.deepEqual(fetched, [workIcon]);
    assert.deepEqual(Object.keys(await box.load('image-cache')), [workIcon]);
    assert.deepEqual(
      [await box.exists('/media/logo.png'), await box.exists('/media/logo-96w.webp')],
      [false, false],
    );
  });

  test('1巻の表紙がある漫画のサムネイルは、取得もせず残しもしない', async () => {
    const hidden = 'https://example.com/key-visual.png';
    const shown = 'https://example.com/uncovered.png';
    const box = await dirsWith(
      {
        previews: {},
        tracks: [],
        series: [
          { title: '寿司ガキ', thumbnail: hidden },
          { title: 'no cover yet', thumbnail: shown },
        ],
        'image-cache': { [hidden]: { file: '/media/hidden.png', checkedAt: fresh() } },
      },
      { 'hidden.png': png, 'hidden-320w.webp': png },
    );
    const { fetch, fetched } = fetchOf(() => new Response(png));
    await cacheImages({ previousPreviews: {}, dirs: box.dirs, fetch });
    assert.deepEqual(fetched, [shown]);
    assert.deepEqual(Object.keys(await box.load('image-cache')), [shown]);
    assert.deepEqual(
      [await box.exists('/media/hidden.png'), await box.exists('/media/hidden-320w.webp')],
      [false, false],
    );
  });
});

describe('plannedWidths', () => {
  for (const [width, planned] of [
    [1200, [320, 480, 640, 960]],
    [400, [320]],
    [300, []],
    [0, []],
  ] as [number, number[]][])
    test(`幅 ${width}px の画像には ${JSON.stringify(planned)} の縮小版を作る（元より2割以上小さいものだけ）`, () => {
      assert.deepEqual(plannedWidths(width), planned);
    });
});

// addVariants run once on four images: an OG thumbnail, an icon, a flat two-colour logo used as an
// icon, and one no longer used.
describe('addVariants', () => {
  let box: Awaited<ReturnType<typeof tempDirs>>;
  const cache: Record<string, CacheEntry> = {
    'https://example.com/og.png': { file: '/media/og.png', checkedAt: 'x' },
    'https://example.com/icon.png': { file: '/media/icon.png', checkedAt: 'x' },
    'https://example.com/flat.png': { file: '/media/flat.png', checkedAt: 'x' },
    'https://example.com/unused.png': { file: '/media/unused.png', checkedAt: 'x', variants: [] },
  };
  beforeAll(async () => {
    const flat =
      '<svg xmlns="http://www.w3.org/2000/svg" width="315" height="315"><rect x="40" y="40" width="235" height="235" fill="#3ea8ff"/></svg>';
    box = await tempDirs(
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
    await addVariants(
      cache,
      new Set(['https://example.com/og.png']),
      new Set(['https://example.com/icon.png', 'https://example.com/flat.png']),
      new Set(),
      box.dirs,
    );
  });
  afterAll(() => box.cleanup());
  const metadata = (file: string) => sharp(new URL(`media/${file}`, box.dirs.public).pathname).metadata();

  test('サムネイルには、320px の WebP の縮小版を作って記録する', async () => {
    const meta = await metadata('og-320w.webp');
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
    const meta = await metadata('icon-96w.webp');
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
      [cache['https://example.com/flat.png'], await box.exists('/media/flat-96w.webp')],
      [{ file: '/media/flat.png', checkedAt: 'x', width: 315 }, false],
    );
  });

  test('使われなくなった画像からは、縮小版の記録を外す', () => {
    assert.deepEqual(cache['https://example.com/unused.png'], { file: '/media/unused.png', checkedAt: 'x' });
  });
});

test('壊れた元画像は、縮小版も幅もないままキャッシュに残す', async () => {
  const source = 'https://example.com/cut.png';
  const box = await dirsWith({}, { 'cut.png': truncatedPng });
  const cache: Record<string, CacheEntry> = { [source]: { file: '/media/cut.png', checkedAt: 'now' } };
  assert.equal(await addVariants(cache, new Set([source]), new Set(), new Set(), box.dirs), 0);
  // Without a width either, so the pages do not promise a srcset it cannot keep.
  assert.deepEqual(cache[source], { file: '/media/cut.png', checkedAt: 'now' });
  assert.equal(await box.exists('/media/cut-320w.webp.tmp'), false);
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

  test('上端の細い線は、反対側になくても切り、残りから 16:9 を切り出す', () => {
    const line = framedCrop(image(480, 360, { top: 48, bottom: 45 }), 480, 360);
    assert.deepEqual([line.top >= 48, line.top + line.height <= 315], [true, true]);
    assert.ok(Math.abs(line.width / line.height - 16 / 9) < 0.01);
  });
});
