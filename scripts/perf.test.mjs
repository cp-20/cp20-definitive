// Regression tests for page weight: thumbnail variants, the client media table, font subsetting,
// cache headers and build-only files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, cp, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import subsetFont from 'subset-font';
import { plannedWidths, variantFile, isVariantFile } from './image-variants.mjs';
import { collectCharacters, fontHead, weights } from './fonts.mjs';
import { clientMedia, coverSrcsets } from '../src/data/client-media.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFile(join(root, path), 'utf8');
const exists = (path) =>
  access(path)
    .then(() => true)
    .catch(() => false);

test('variants are only planned when they are a real reduction', () => {
  assert.deepEqual(plannedWidths(1200), [320, 640, 960]);
  assert.deepEqual(plannedWidths(1024), [320, 640]);
  assert.deepEqual(plannedWidths(400), [320]);
  assert.deepEqual(plannedWidths(300), []);
  assert.deepEqual(plannedWidths(0), []);
  assert.equal(variantFile('/media/abc.png', 320), '/media/abc-320w.webp');
  assert.ok(isVariantFile('/media/abc-320w.webp') && !isVariantFile('/media/abc.png'));
});

test('addVariants writes smaller WebP copies for thumbnails and icons only, and only when they are smaller', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cp20-variants-'));
  try {
    await cp(join(root, 'scripts'), join(dir, 'scripts'), { recursive: true });
    await mkdir(join(dir, 'src/data'), { recursive: true });
    for (const file of ['variant-names.mjs', 'manga-covers.mjs'])
      await cp(join(root, 'src/data', file), join(dir, 'src/data', file));
    await symlink(join(root, 'node_modules'), join(dir, 'node_modules'));
    await mkdir(join(dir, 'public/media'), { recursive: true });
    const png = await readFile(join(root, 'public/images/avatar.png')); // 512px
    await writeFile(join(dir, 'public/media/og.png'), png);
    await writeFile(join(dir, 'public/media/icon.png'), png);
    await writeFile(join(dir, 'public/media/unused.png'), png);
    // A flat logo (from the real cache) is smaller as PNG than as WebP: no copy is kept for it.
    await cp(join(root, 'public/media/e6c38336be5beec59bb0ce2d.png'), join(dir, 'public/media/flat.png'));
    const { addVariants } = await import(pathToFileURL(join(dir, 'scripts/image-variants.mjs')).href);
    const cache = {
      'https://example.com/og.png': { file: '/media/og.png', checkedAt: 'x' },
      'https://example.com/icon.png': { file: '/media/icon.png', checkedAt: 'x' },
      'https://example.com/flat.png': { file: '/media/flat.png', checkedAt: 'x' },
      'https://example.com/unused.png': { file: '/media/unused.png', checkedAt: 'x', variants: [] },
    };
    await addVariants(
      cache,
      new Set(['https://example.com/og.png']),
      new Set(['https://example.com/icon.png', 'https://example.com/flat.png']),
    );
    assert.deepEqual(cache['https://example.com/og.png'], {
      file: '/media/og.png',
      checkedAt: 'x',
      width: 512,
      variants: [{ file: '/media/og-320w.webp', width: 320 }],
    });
    assert.deepEqual(cache['https://example.com/icon.png'], {
      file: '/media/icon.png',
      checkedAt: 'x',
      width: 512,
      variants: [{ file: '/media/icon-96w.webp', width: 96 }],
    });
    assert.deepEqual(cache['https://example.com/flat.png'], {
      file: '/media/flat.png',
      checkedAt: 'x',
      width: 315,
    });
    assert.ok(!(await exists(join(dir, 'public/media/flat-96w.webp'))));
    assert.deepEqual(cache['https://example.com/unused.png'], { file: '/media/unused.png', checkedAt: 'x' });
    const meta = await sharp(join(dir, 'public/media/og-320w.webp')).metadata();
    assert.deepEqual([meta.format, meta.width, meta.height], ['webp', 320, 320]);
    const icon = await sharp(join(dir, 'public/media/icon-96w.webp')).metadata();
    assert.deepEqual([icon.format, icon.width], ['webp', 96]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('every committed OG image wider than 400px has its thumbnail variants on disk', async () => {
  const cache = JSON.parse(await read('src/data/image-cache.json'));
  const previews = JSON.parse(await read('src/data/previews.json'));
  for (const { image } of Object.values(previews)) {
    const entry = image && cache[image];
    if (!entry || !(entry.width > 400) || /\.(gif|ico)$/.test(entry.file)) continue;
    assert.ok(entry.variants?.length, `${entry.file} has no variants`);
    for (const v of entry.variants) assert.ok(await exists(join(root, 'public', v.file)), v.file);
  }
});

test('every music and manga thumbnail and site icon has its WebP copies on disk', async () => {
  const cache = JSON.parse(await read('src/data/image-cache.json'));
  const previews = JSON.parse(await read('src/data/previews.json'));
  const items = [
    ...JSON.parse(await read('src/data/tracks.json')),
    ...JSON.parse(await read('src/data/series.json')),
  ];
  for (const source of [...items.map((i) => i.thumbnail), ...Object.values(previews).map((p) => p.icon)]) {
    const entry = source && cache[source];
    if (!entry || /\.(gif|ico|svg)$/.test(entry.file)) continue;
    assert.ok(entry.width > 0, `${entry.file} has no recorded width`);
    for (const v of entry.variants ?? []) assert.ok(await exists(join(root, 'public', v.file)), v.file);
  }
  for (const { thumbnail } of items) {
    const entry = cache[thumbnail];
    if (entry?.width >= 400) assert.ok(entry.variants?.length, `${entry.file} has no variants`);
  }
});

test('every manga cover has WebP copies whose srcset descriptors are their real widths', async () => {
  const editorial = await read('src/data/manga-covers.mjs');
  const covers = [...editorial.matchAll(/image: '(\/images\/covers\/[^']+)'/g)].map((m) => m[1]);
  assert.equal(covers.length, 6);
  const srcsets = coverSrcsets(await readdir(join(root, 'public/images/covers')));
  for (const image of covers) {
    const { width } = await sharp(join(root, 'public', image)).metadata();
    const candidates = srcsets[image]?.split(', ').map((c) => c.split(' ')) ?? [];
    assert.ok(candidates.length, `${image} has no WebP copies`);
    // The largest copy is the full-size one, so the shelf never shows a blurrier cover than before.
    assert.equal(candidates.at(-1)?.[1], `${width}w`, image);
    for (const [file, descriptor] of candidates) {
      const copy = await sharp(join(root, 'public', file)).metadata();
      assert.deepEqual([copy.format, `${copy.width}w`], ['webp', descriptor], file);
    }
  }
  assert.deepEqual(
    coverSrcsets(['a.jpg', 'a-240w.webp', 'a-480w.webp', 'a-b.jpg', 'b.png', 'notes.txt'], '/c/'),
    {
      '/c/a.jpg': '/c/a-240w.webp 240w, /c/a-480w.webp 480w',
    },
  );
});

test('covers, music thumbnails and icons are offered at their shown size', async () => {
  const pages = await read('src/pages.tsx');
  for (const name of ['bookCover', 'homeCover', 'homeTrack', 'track'])
    assert.match(pages, new RegExp(`\\.\\.\\.responsive\\([^)]*\\)?[^)]*, sizes\\.${name}\\)`), name);
  assert.equal((pages.match(/\.\.\.responsive\(/g) ?? []).length, 4);
});

test('client-rendered images get srcset only through responsive(), after the page settles', async () => {
  // In Chromium an <img> given srcset while Solid builds a page kept that page in memory after
  // it was swapped out (browser-check.mjs measures this).
  for (const file of ['src/pages.tsx', 'src/components/Preview.tsx', 'src/components/Projects.tsx']) {
    const source = await read(file);
    assert.ok(!/\bsrcset=\{(?!image\.srcset\})/.test(source), file);
  }
  const preview = await read('src/components/Preview.tsx');
  assert.match(preview, /srcset: isServer \? set\?\.srcset : undefined/);
  assert.match(preview, /onSettled\(\(\) => \{\s*img\.sizes = set\.sizes;\s*img\.srcset = set\.srcset;/);
});

test('articles are merged and validated at build time, and dates share one formatter', async () => {
  const content = await read('src/data/content.ts');
  assert.ok(content.includes("from 'virtual:cp20-articles'"));
  assert.ok(
    !/mergeArticles|normalize\.mjs/.test(content),
    'content.ts must not merge articles in the browser',
  );
  assert.ok(!/=>\s*new Intl\.DateTimeFormat/.test(content), 'formatDate must not build a formatter per call');
  const config = await read('vite.config.ts');
  assert.match(config, /mergeArticles\(snapshot\.articles, \[\], manual\)/);
});

test('the client media table keeps only local paths, srcset candidates and sizes', () => {
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
  assert.deepEqual(pages[page], {
    width: 1200,
    height: 630,
    image: '/media/og.png',
    srcset: '/media/og-320w.webp 320w, /media/og-640w.webp 640w, /media/og.png 1200w',
    icon: '/media/icon-96w.webp',
  });
  assert.deepEqual(pages['https://example.com/none'], { width: 1200, height: 630 });
  assert.deepEqual(images, {
    'https://i.ytimg.com/vi/a/hq.jpg': {
      src: '/media/yt.jpg',
      srcset: '/media/yt-320w.webp 320w, /media/yt.jpg 480w',
    },
    'https://i.ytimg.com/vi/b/hq.jpg': { src: '/media/yt-b.jpg' },
  });
  const serialized = JSON.stringify({ pages, images });
  assert.ok(!serialized.includes('checkedAt') && !serialized.includes('cdn.example.com'));
});

test('the app reads images from the compact media module, not the raw JSON files', async () => {
  for (const file of ['src/data/images.ts', 'src/components/Preview.tsx']) {
    const source = await read(file);
    assert.ok(source.includes("from 'virtual:cp20-media'"), file);
    assert.ok(!/image-cache\.json|previews\.json/.test(source), file);
  }
});

test('the works grid loads its first row eagerly and thumbnails offer sizes', async () => {
  const pages = await read('src/pages.tsx');
  assert.match(pages, /priority=\{i\(\) === 0\}\s+eager=\{i\(\) < firstRowWorks\}/);
  assert.match(pages, /sizes=\{sizes\.articleRow\}/);
  assert.match(await read('src/components/Projects.tsx'), /sizes=\{sizes\.featured\}/);
});

test('font characters include escapes, character references and printable ASCII', () => {
  const chars = collectCharacters(['あ', '"\\u3044\\u{1F600}"', '<p>&#x3046;&#12360;</p>', '\u0007']);
  for (const c of ['あ', 'い', '😀', 'う', 'え', 'A', '~', ' ']) assert.ok(chars.includes(c), c);
  assert.ok(!chars.includes('\u0007'));
});

test('the font head declares one WOFF2 file per weight and nothing else', () => {
  const head = fontHead([
    { weight: 500, href: '/assets/z-500-a.woff2' },
    { weight: 700, href: '/assets/z-700-b.woff2' },
  ]);
  assert.equal(head.match(/@font-face/g).length, 2);
  assert.match(head, /font-weight:500;src:url\(\/assets\/z-500-a\.woff2\) format\('woff2'\)/);
  assert.ok(!head.includes('unicode-range') && !head.includes("format('woff')"));
});

test('the vendored fonts subset to small WOFF2 files', async () => {
  for (const weight of weights) {
    const full = await readFile(join(root, `fonts/zen-maru-gothic/zen-maru-gothic-${weight}.woff2`));
    const subset = await subsetFont(full, 'しーぴーのスタンプ帳cp20', { targetFormat: 'woff2' });
    assert.equal(subset.subarray(0, 4).toString('latin1'), 'wOF2');
    assert.ok(subset.length < 20_000, `${weight}: ${subset.length} bytes`);
  }
});

test('the client no longer imports the split @fontsource Zen Maru Gothic in builds', async () => {
  const app = await read('src/App.tsx');
  assert.ok(!/^import '@fontsource\/zen-maru-gothic/m.test(app));
  assert.match(app, /if \(import\.meta\.env\.DEV\)/);
});

test('non-hashed images and stickers are cached, build manifest is not published', async () => {
  const headers = await read('public/_headers');
  for (const path of ['/images/*', '/stamps/*'])
    assert.match(
      headers,
      new RegExp(`^${path.replace('*', '\\*')}\\n\\s+Cache-Control: public, max-age=86400`, 'm'),
      path,
    );
  assert.match(await read('scripts/prerender.mjs'), /rm\('dist\/client\/\.vite'/);
});
