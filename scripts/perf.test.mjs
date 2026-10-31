// Regression tests for page weight: thumbnail variants, the client media table, font subsetting,
// cache headers and build-only files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, cp, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import subsetFont from 'subset-font';
import { plannedWidths, variantFile, isVariantFile } from './image-variants.mjs';
import { collectCharacters, fontHead, weights } from './fonts.mjs';
import { clientMedia } from '../src/data/client-media.mjs';

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

test('addVariants writes smaller WebP copies and records them for OG images only', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cp20-variants-'));
  try {
    await cp(join(root, 'scripts'), join(dir, 'scripts'), { recursive: true });
    await symlink(join(root, 'node_modules'), join(dir, 'node_modules'));
    await mkdir(join(dir, 'public/media'), { recursive: true });
    const png = await readFile(join(root, 'public/images/avatar.png')); // 512px
    await writeFile(join(dir, 'public/media/og.png'), png);
    await writeFile(join(dir, 'public/media/icon.png'), png);
    const { addVariants } = await import(pathToFileURL(join(dir, 'scripts/image-variants.mjs')).href);
    const cache = {
      'https://example.com/og.png': { file: '/media/og.png', checkedAt: 'x' },
      'https://example.com/icon.png': { file: '/media/icon.png', checkedAt: 'x', variants: [] },
    };
    await addVariants(cache, new Set(['https://example.com/og.png']));
    assert.deepEqual(cache['https://example.com/og.png'], {
      file: '/media/og.png',
      checkedAt: 'x',
      width: 512,
      variants: [{ file: '/media/og-320w.webp', width: 320 }],
    });
    assert.deepEqual(cache['https://example.com/icon.png'], { file: '/media/icon.png', checkedAt: 'x' });
    const meta = await sharp(join(dir, 'public/media/og-320w.webp')).metadata();
    assert.deepEqual([meta.format, meta.width, meta.height], ['webp', 320, 320]);
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
      'https://cdn.example.com/icon.png': { file: '/media/icon.png', checkedAt: 'x' },
      'https://i.ytimg.com/vi/a/hq.jpg': { file: '/media/yt.jpg', checkedAt: 'x' },
      'https://unused.example.com/a.png': { file: '/media/unused.png', checkedAt: 'x' },
    },
    ['https://i.ytimg.com/vi/a/hq.jpg', null],
  );
  assert.deepEqual(pages[page], {
    width: 1200,
    height: 630,
    image: '/media/og.png',
    srcset: '/media/og-320w.webp 320w, /media/og-640w.webp 640w, /media/og.png 1200w',
    icon: '/media/icon.png',
  });
  assert.deepEqual(pages['https://example.com/none'], { width: 1200, height: 630 });
  assert.deepEqual(images, { 'https://i.ytimg.com/vi/a/hq.jpg': '/media/yt.jpg' });
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
