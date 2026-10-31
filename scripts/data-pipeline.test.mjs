// Regression tests for hostile or malformed third-party data entering the content pipeline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, rm, symlink, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parsePreview, dimensions } from './previews.mjs';
import { ogImage } from './media.mjs';
import { fetchGhostPosts } from './ghost.mjs';
import { article, collect, parseFeed, request } from './sync.mjs';
import { stripInvalidText } from '../src/data/normalize.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const png = await readFile(new URL('../public/images/avatar.png', import.meta.url));
const key = 'abcdef0123456789:' + 'ab'.repeat(32);

/** Copies the pipeline scripts into a temporary repository so file-writing code never touches src/data. */
async function sandbox(data, media = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'cp20-pipeline-'));
  await cp(join(root, 'scripts'), join(dir, 'scripts'), { recursive: true });
  await mkdir(join(dir, 'src/data'), { recursive: true });
  await cp(join(root, 'src/data/normalize.mjs'), join(dir, 'src/data/normalize.mjs'));
  await mkdir(join(dir, 'public/media'), { recursive: true });
  await symlink(join(root, 'node_modules'), join(dir, 'node_modules'));
  for (const [name, value] of Object.entries(data))
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

test('unclosed meta tags and long attribute names are parsed in linear time', () => {
  const hostile = '<html><head>' + '<meta '.repeat(170_000) + 'a'.repeat(200_000);
  const names = '<meta ' + 'a'.repeat(4000) + '>';
  let started = performance.now();
  assert.equal(parsePreview(hostile, 'https://example.com').image, null);
  assert.equal(parsePreview(names.repeat(250), 'https://example.com').image, null);
  assert.throws(() => ogImage(hostile));
  assert.throws(() => ogImage(names.repeat(250)));
  assert.ok(performance.now() - started < 2000, 'parsing must not be quadratic');
  // Normal pages, including bodies after </head>, are still read from the head.
  started = performance.now();
  assert.equal(
    ogImage(
      '<head><meta property="og:image" content="https://public.ynjn.jp/a.jpg?x=1&amp;y=2"></head>' +
        '<body>' +
        '<meta '.repeat(100_000),
    ),
    'https://public.ynjn.jp/a.jpg?x=1&y=2',
  );
  assert.ok(performance.now() - started < 1000);
});

test('OG dimensions outside 1..10000 fall back to defaults', () => {
  const page = (w, h) =>
    `<meta property="og:image" content="https://example.com/a.png"><meta property="og:image:width" content="${w}"><meta property="og:image:height" content="${h}">`;
  for (const [w, h] of [
    ['1e999', '-3'],
    ['0', 'NaN'],
    ['12.5', '99999'],
  ]) {
    const { width, height } = parsePreview(page(w, h), 'https://example.com');
    assert.deepEqual([width, height], [1200, 630]);
  }
  assert.deepEqual(
    (({ width, height }) => [width, height])(parsePreview(page('800', '400'), 'https://example.com')),
    [800, 400],
  );
});

test('response size limits: truncate for HTML heads, fail for everything else', async () => {
  const big = () => new Response('x'.repeat(3000));
  assert.equal(
    (await request('https://example.com', 'html', big, {}, { maxBytes: 1000, truncate: true })).length,
    1000,
  );
  await assert.rejects(request('https://example.com', 'html', big, {}, { maxBytes: 1000 }));
});

test('new OG images are accepted only when they are cacheable rasters', async () => {
  assert.deepEqual(
    Object.keys(await dimensions('https://example.com/a.png', async () => new Response(png))),
    ['width', 'height'],
  );
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"></svg>';
  await assert.rejects(dimensions('https://example.com/a.svg', async () => new Response(svg)));
  await assert.rejects(
    dimensions(
      'https://example.com/huge.png',
      async () => new Response(Buffer.concat([png, Buffer.alloc(15e6)])),
    ),
  );
  await assert.rejects(
    dimensions('https://example.com/a.png', async () => new Response('busy', { status: 503 })),
  );
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

test('Ghost responses missing filter fields, or matching nothing, keep the previous snapshot', async () => {
  const post = {
    title: 't',
    url: 'https://trap.jp/post/1/',
    published_at: '2026-01-01',
    status: 'published',
    visibility: 'public',
    authors: [{ slug: 'cp20' }],
  };
  const reply = (posts) => async () => ({ posts, meta: { pagination: { page: 1, next: null } } });
  const { authors, ...withoutAuthors } = post;
  await assert.rejects(fetchGhostPosts(reply([withoutAuthors]), article, key), /shape/);
  await assert.rejects(fetchGhostPosts(reply([{ ...post, authors: [{ slug: 'other' }] }]), article, key));
  assert.deepEqual(await fetchGhostPosts(reply([]), article, key), []);
  assert.equal((await fetchGhostPosts(reply([post]), article, key)).length, 1);
});

test('a sudden large drop in trap.jp posts is stale unless explicitly allowed', async () => {
  const articles = Array.from({ length: 10 }, (_, i) =>
    article(`p${i}`, `https://trap.jp/post/${i}/`, '2025-01-01', 'trap.jp'),
  );
  const previous = { articles, repos: [], sources: { 'trap.jp': { status: 'ok' } }, updatedAt: '2025-01-01' };
  const zenn = async () => [article('z', 'https://zenn.dev/cp20/articles/1', '2026-01-01', 'zenn.dev')];
  const blocked = await collect(
    previous,
    { 'trap.jp': async () => articles.slice(0, 3), 'zenn.dev': zenn },
    'now',
    false,
  );
  assert.equal(blocked.sources['trap.jp'].status, 'stale');
  assert.equal(blocked.articles.filter((a) => a.source === 'trap.jp').length, 10);
  const allowed = await collect(
    previous,
    { 'trap.jp': async () => articles.slice(0, 3), 'zenn.dev': zenn },
    'now',
    true,
  );
  assert.equal(allowed.articles.filter((a) => a.source === 'trap.jp').length, 3);
  const small = await collect(previous, { 'trap.jp': async () => articles.slice(0, 6) }, 'now', false);
  assert.equal(small.sources['trap.jp'].status, 'ok');
});

test('XML-invalid characters are removed from titles and feed text', () => {
  assert.equal(
    article('a\u0007b\u0000￾', 'https://zenn.dev/cp20/articles/1', '2026-01-01', 'zenn.dev').title,
    'ab',
  );
  assert.equal(stripInvalidText('x\uD800y\uDC00z😀\t\n'), 'xyz😀\t\n');
  assert.throws(() => article('\u0001\u0002', 'https://zenn.dev/cp20/articles/1', '2026-01-01', 'zenn.dev'));
});

test('RSS titles stay strings, hex references decode, and one bad item does not drop the feed', () => {
  const item = (title, n, date = 'Tue, 01 Sep 2026 00:00:00 GMT') =>
    `<item><title>${title}</title><link>https://note.com/cp20/n/${n}</link><pubDate>${date}</pubDate></item>`;
  const rows = parseFeed(
    `<rss><channel>${['2024', '1e3', 'true', '0x1F', ' 007 ', '&#x3C;b&#x3E;'].map((t, n) => item(t, n)).join('')}${item('bad', 9, 'not a date')}</channel></rss>`,
    'note.com',
  );
  assert.deepEqual(
    rows.map((r) => r.title),
    ['2024', '1e3', 'true', '0x1F', '007', '<b>'],
  );
  assert.throws(() => parseFeed(`<rss><channel>${item('bad', 1, 'not a date')}</channel></rss>`, 'note.com'));
});
