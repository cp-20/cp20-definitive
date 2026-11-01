// Regression tests for hostile or malformed third-party data entering the content pipeline.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, rm, symlink, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parsePreview, dimensions } from './previews.mjs';
import { ogImage } from './media.mjs';
import { article, collect, parseFeed, request } from './sync.mjs';
import { stripInvalidText } from '../src/content/normalize.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const png = await readFile(new URL('../public/images/avatar.png', import.meta.url));
const key = 'abcdef0123456789:' + 'ab'.repeat(32);

/** Copies the pipeline scripts into a temporary repository so file-writing code never touches src/data. */
async function sandbox(data, media = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'cp20-pipeline-'));
  await cp(join(root, 'scripts'), join(dir, 'scripts'), { recursive: true });
  // The code under src, but none of its data: each test writes the data it needs.
  await cp(join(root, 'src'), join(dir, 'src'), {
    recursive: true,
    filter: (path) => !path.endsWith('.json'),
  });
  await mkdir(join(dir, 'public/media'), { recursive: true });
  await symlink(join(root, 'node_modules'), join(dir, 'node_modules'));
  for (const [name, value] of Object.entries({ works: [], ...data }))
    await writeFile(join(dir, 'src/data', `${name}.json`), JSON.stringify(value));
  for (const [name, bytes] of Object.entries(media)) await writeFile(join(dir, 'public/media', name), bytes);
  const load = (name) => readFile(join(dir, 'src/data', `${name}.json`), 'utf8').then(JSON.parse);
  const exists = (path) =>
    access(join(dir, path))
      .then(() => true)
      .catch(() => false);
  const importScript = (name) => import(pathToFileURL(join(dir, 'scripts', name)).href);
  return { dir, load, exists, importScript, cleanup: () => rm(dir, { recursive: true, force: true }) };
}
async function withFetch(fetcher, run) {
  const original = globalThis.fetch;
  globalThis.fetch = fetcher;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

describe('悪意のある HTML を線形時間で読む', () => {
  const hostile = '<html><head>' + '<meta '.repeat(170_000) + 'a'.repeat(200_000);
  const names = ('<meta ' + 'a'.repeat(4000) + '>').repeat(250);
  // How long `run` takes, in milliseconds.
  const time = (run) => {
    const started = performance.now();
    run();
    return performance.now() - started;
  };

  test('閉じない meta タグが大量にあっても、プレビューは2秒以内に「画像なし」になる', () => {
    let image;
    assert.ok(time(() => (image = parsePreview(hostile, 'https://example.com').image)) < 2000);
    assert.equal(image, null);
  });

  test('長い属性名の meta タグが大量にあっても、プレビューは2秒以内に「画像なし」になる', () => {
    let image;
    assert.ok(time(() => (image = parsePreview(names, 'https://example.com').image)) < 2000);
    assert.equal(image, null);
  });

  for (const [what, html] of [
    ['閉じない meta タグ', hostile],
    ['長い属性名', names],
  ])
    test(`${what}だらけの漫画ページからは OG 画像を読まずに失敗する`, () => {
      assert.throws(() => ogImage(html));
    });

  test('</head> のあとに何があっても、head の OG 画像を読む', () => {
    const page =
      '<head><meta property="og:image" content="https://public.ynjn.jp/a.jpg?x=1&amp;y=2"></head><body>' +
      '<meta '.repeat(100_000);
    let image;
    assert.ok(time(() => (image = ogImage(page))) < 1000);
    assert.equal(image, 'https://public.ynjn.jp/a.jpg?x=1&y=2');
  });
});

describe('OG 画像の大きさ', () => {
  const page = (w, h) =>
    `<meta property="og:image" content="https://example.com/a.png"><meta property="og:image:width" content="${w}"><meta property="og:image:height" content="${h}">`;
  const size = (w, h) => {
    const { width, height } = parsePreview(page(w, h), 'https://example.com');
    return [width, height];
  };
  for (const [w, h] of [
    ['1e999', '-3'],
    ['0', 'NaN'],
    ['12.5', '99999'],
  ])
    test(`${w}×${h} は 1〜10000 の範囲外なので、既定の 1200×630 にする`, () => {
      assert.deepEqual(size(w, h), [1200, 630]);
    });

  test('範囲内の大きさはそのまま使う', () => {
    assert.deepEqual(size('800', '400'), [800, 400]);
  });
});

describe('レスポンスの大きさの上限', () => {
  const big = () => new Response('x'.repeat(3000));
  test('HTML の head を読むときは、上限で切り詰める', async () => {
    const html = await request('https://example.com', 'html', big, {}, { maxBytes: 1000, truncate: true });
    assert.equal(html.length, 1000);
  });

  test('それ以外では、上限を超えたら失敗にする', async () => {
    await assert.rejects(request('https://example.com', 'html', big, {}, { maxBytes: 1000 }));
  });
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
  ])
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
    const { cacheImages } = await box.importScript('cache-images.mjs');
    await withFetch(
      async (url) => new Response(String(url) === cut ? truncatedPng : png),
      () => cacheImages(false, {}),
    );
    assert.deepEqual(Object.keys(await box.load('image-cache')), [good]);
  } finally {
    await box.cleanup();
  }
});

test('a corrupt cached original keeps its entry without variants', async () => {
  const source = 'https://example.com/cut.png';
  const box = await sandbox({}, { 'cut.png': truncatedPng });
  try {
    const { addVariants } = await box.importScript('image-variants.mjs');
    const cache = { [source]: { file: '/media/cut.png', checkedAt: 'now' } };
    assert.equal(await addVariants(cache, new Set([source])), 0);
    assert.equal(cache[source].variants, undefined);
    // No width either, so the snapshot tests (variants for every wide thumbnail) still pass.
    assert.equal(cache[source].width, undefined);
    assert.equal(await box.exists('public/media/cut-320w.webp.tmp'), false);
  } finally {
    await box.cleanup();
  }
});

test('a failed image refresh keeps the previous image together with its own dimensions', async () => {
  const page = 'https://example.com/work';
  const box = await sandbox({
    previews: {
      [page]: {
        image: 'https://example.com/og.png',
        icon: null,
        width: 1200,
        height: 600,
        checkedAt: '2000-01-01',
      },
    },
    works: [{ url: page }],
    manual: { projects: [], articles: [], exclude: [], overrides: {} },
    generated: { articles: [] },
  });
  try {
    const { syncPreviews } = await box.importScript('previews.mjs');
    const html =
      '<meta property="og:image" content="https://example.com/og.svg"><meta property="og:image:width" content="1e999"><meta property="og:image:height" content="-3">';
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>';
    await withFetch(
      async () => new Response(svg),
      () => syncPreviews(async () => html),
    );
    const { image, width, height } = (await box.load('previews'))[page];
    assert.deepEqual(
      { image, width, height },
      { image: 'https://example.com/og.png', width: 1200, height: 600 },
    );
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
    const { cacheImages } = await box.importScript('cache-images.mjs');
    await withFetch(
      async () => new Response('busy', { status: 503 }),
      () => cacheImages(false, { [page]: before }),
    );
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
    const { cacheImages } = await box.importScript('cache-images.mjs');
    const offline = async () => new Response('busy', { status: 503 });
    assert.equal(await withFetch(offline, () => cacheImages(false, {})), true, 'variants were added');
    const cached = (await box.load('image-cache'))[image];
    assert.ok(cached.variants?.length, 'the cache records the new variants');
    assert.equal(await withFetch(offline, () => cacheImages(false, {})), false, 'nothing changed');
    // The variants disappear from the manifest (e.g. a hand-edited or older cache): a change again.
    await writeFile(
      join(box.dir, 'src/data/image-cache.json'),
      JSON.stringify({ [image]: { file: cached.file, checkedAt: cached.checkedAt } }),
    );
    assert.equal(await withFetch(offline, () => cacheImages(false, {})), true, 'variants were restored');
  } finally {
    await box.cleanup();
  }
});

describe('trap.jp の記事が急に減ったとき', () => {
  const articles = Array.from({ length: 10 }, (_, i) =>
    article(`p${i}`, `https://trap.jp/post/${i}/`, '2025-01-01', 'trap.jp'),
  );
  const previous = { articles, repos: [], sources: { 'trap.jp': { status: 'ok' } }, updatedAt: '2025-01-01' };
  const zenn = async () => [article('z', 'https://zenn.dev/cp20/articles/1', '2026-01-01', 'zenn.dev')];
  const trapCount = (result) => result.articles.filter((a) => a.source === 'trap.jp').length;

  test('半分未満に減ったら stale にして、前回の10件を残す', async () => {
    const result = await collect(
      previous,
      { 'trap.jp': async () => articles.slice(0, 3), 'zenn.dev': zenn },
      'now',
      false,
    );
    assert.deepEqual([result.sources['trap.jp'].status, trapCount(result)], ['stale', 10]);
  });

  test('明示的に許したら、減った3件を受け入れる', async () => {
    const result = await collect(
      previous,
      { 'trap.jp': async () => articles.slice(0, 3), 'zenn.dev': zenn },
      'now',
      true,
    );
    assert.equal(trapCount(result), 3);
  });

  test('半分以上残っていれば、そのまま受け入れる', async () => {
    const result = await collect(previous, { 'trap.jp': async () => articles.slice(0, 6) }, 'now', false);
    assert.equal(result.sources['trap.jp'].status, 'ok');
  });
});

describe('XML に使えない文字', () => {
  test('記事名から取り除く', () => {
    assert.equal(
      article('a\u0007b\u0000￾', 'https://zenn.dev/cp20/articles/1', '2026-01-01', 'zenn.dev').title,
      'ab',
    );
  });

  test('対になっていないサロゲートを取り除き、絵文字やタブ・改行は残す', () => {
    assert.equal(stripInvalidText('x\uD800y\uDC00z😀\t\n'), 'xyz😀\t\n');
  });

  test('取り除いて空になる記事名は失敗にする', () => {
    assert.throws(() =>
      article('\u0001\u0002', 'https://zenn.dev/cp20/articles/1', '2026-01-01', 'zenn.dev'),
    );
  });
});

describe('RSS の記事名', () => {
  const item = (title, n, date = 'Tue, 01 Sep 2026 00:00:00 GMT') =>
    `<item><title>${title}</title><link>https://note.com/cp20/n/${n}</link><pubDate>${date}</pubDate></item>`;

  test('数値や真偽値に見える記事名も文字列のまま読み、16進の文字参照を解く', () => {
    const titles = ['2024', '1e3', 'true', '0x1F', ' 007 ', '&#x3C;b&#x3E;'];
    const rows = parseFeed(
      `<rss><channel>${titles.map((t, n) => item(t, n)).join('')}</channel></rss>`,
      'note.com',
    );
    assert.deepEqual(
      rows.map((r) => r.title),
      ['2024', '1e3', 'true', '0x1F', '007', '<b>'],
    );
  });

  test('日付の読めない記事が1件あっても、ほかの記事は読む', () => {
    const rows = parseFeed(
      `<rss><channel>${item('ok', 1)}${item('bad', 9, 'not a date')}</channel></rss>`,
      'note.com',
    );
    assert.deepEqual(
      rows.map((r) => r.title),
      ['ok'],
    );
  });

  test('読める記事が1件もなければ失敗にする', () => {
    assert.throws(() =>
      parseFeed(`<rss><channel>${item('bad', 1, 'not a date')}</channel></rss>`, 'note.com'),
    );
  });
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
    const { cacheImages } = await box.importScript('cache-images.mjs');
    const fetched = [];
    await withFetch(
      async (url) => (fetched.push(String(url)), new Response(png)),
      () => cacheImages(false, { [post]: { image: null, icon: logo, width: 1200, height: 630 } }),
    );
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
    const { cacheImages } = await box.importScript('cache-images.mjs');
    const fetched = [];
    await withFetch(
      async (url) => (fetched.push(String(url)), new Response(png)),
      () => cacheImages(false, {}),
    );
    assert.deepEqual(fetched, [shown]);
    assert.deepEqual(Object.keys(await box.load('image-cache')), [shown]);
    assert.equal(await box.exists('public/media/hidden.png'), false);
    assert.equal(await box.exists('public/media/hidden-320w.webp'), false);
  } finally {
    await box.cleanup();
  }
});

describe('曲のリンク', () => {
  const track = (link) => ({ title: 't', composer: 'c', link });
  const sync = async (rows) => {
    const box = await sandbox({ tracks: [], series: [] });
    try {
      const { syncMedia } = await box.importScript('media.mjs');
      const changed = await syncMedia(async (url) => (String(url).includes('featured-tracks') ? rows : []));
      return { changed, tracks: await box.load('tracks') };
    } finally {
      await box.cleanup();
    }
  };

  for (const link of [
    'javascript://youtu.be/upUv8iWVs-I?%0Aalert(document.domain)',
    'http://youtu.be/upUv8iWVs-I',
    'data://youtu.be/upUv8iWVs-I',
  ])
    test(`${link} の曲は取り込まない`, async () => {
      assert.deepEqual(await sync([track(link)]), { changed: false, tracks: [] });
    });

  test('https://youtu.be/<id> のリンクは、クエリとハッシュを落として取り込む', async () => {
    const { changed, tracks } = await sync([track('https://youtu.be/upUv8iWVs-I?si=x#t=1')]);
    assert.deepEqual([changed, tracks[0].link], [true, 'https://youtu.be/upUv8iWVs-I']);
  });
});

test('コミットされた曲のリンクは、どれも素の https://youtu.be/<id>', async () => {
  const tracks = JSON.parse(await readFile(join(root, 'src/data/tracks.json'), 'utf8'));
  assert.deepEqual(
    tracks.map((t) => t.link).filter((link) => !/^https:\/\/youtu\.be\/[-_A-Za-z0-9]{11}$/.test(link)),
    [],
  );
});

test('a trap.jp post linked by a work survives when the author pages stop listing it', async () => {
  const articles = Array.from({ length: 10 }, (_, i) =>
    article(`p${i}`, `https://trap.jp/post/${i}/`, '2025-01-01', 'trap.jp'),
  );
  const previous = { articles, repos: [], sources: {}, updatedAt: '2025-01-01' };
  const pinned = new Set(['https://trap.jp/post/0/']);
  const next = await collect(previous, { 'trap.jp': async () => articles.slice(1) }, 'now', false, pinned);
  assert.equal(next.sources['trap.jp'].status, 'ok');
  assert.deepEqual(
    next.articles
      .filter((a) => a.source === 'trap.jp')
      .map((a) => a.url)
      .sort(),
    articles.map((a) => a.url).sort(),
  );
  // Unlinked posts are still removed.
  const pruned = await collect(previous, { 'trap.jp': async () => articles.slice(2) }, 'now', false, pinned);
  assert.equal(pruned.articles.filter((a) => a.source === 'trap.jp').length, 9);
});
