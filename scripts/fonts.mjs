// Subsets Zen Maru Gothic 500/700 to the characters the built site can show and declares the two
// WOFF2 files in every page: two font requests per page instead of dozens of @fontsource
// unicode-range slices. Runs after prerender, so the text of every page and every string in
// the client JavaScript (client-rendered views, sticker messages) is included.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import subsetFont from 'subset-font';

export const family = 'Zen Maru Gothic';
export const weights = [500, 700];
const source = (weight) =>
  new URL(`../fonts/zen-maru-gothic/zen-maru-gothic-${weight}.woff2`, import.meta.url);

/**
 * Every character that can be rendered from these files: literal text plus \uXXXX / \u{…} escapes
 * and HTML character references, with printable ASCII always included.
 * @param {string[]} texts
 */
export function collectCharacters(texts) {
  const chars = new Set();
  for (let c = 0x20; c < 0x7f; c++) chars.add(String.fromCharCode(c));
  const add = (text) => {
    for (const c of text) if (c.codePointAt(0) >= 0x20) chars.add(c);
  };
  for (const text of texts) {
    add(text);
    for (const m of text.matchAll(
      /\\u\{([0-9a-f]{1,6})\}|\\u([0-9a-f]{4})|&#x([0-9a-f]{1,6});|&#(\d{1,7});/gi,
    )) {
      const code = m[1] || m[2] || m[3] ? parseInt(m[1] || m[2] || m[3], 16) : Number(m[4]);
      if (code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)) add(String.fromCodePoint(code));
    }
  }
  return [...chars].sort().join('');
}

/**
 * `<head>` addition for the subset files: one @font-face per weight. No preload: the inline rules
 * are seen as soon as the HTML is parsed, and preloading both weights only delayed the first paint
 * (measured on Slow 4G) without making the text arrive sooner.
 */
export function fontHead(files) {
  return `<style>${files
    .map(
      ({ weight, href }) =>
        `@font-face{font-family:'${family}';font-style:normal;font-display:swap;font-weight:${weight};src:url(${href}) format('woff2')}`,
    )
    .join('')}</style>`;
}

async function files(dir, pattern) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await files(path, pattern)));
    else if (pattern.test(entry.name)) out.push(path);
  }
  return out;
}

// harfbuzz keeps only name IDs 0-6 by default; the subset is a Modified Version under the SIL OFL,
// which must still carry the copyright and license, so keep the designer, vendor, URL and license
// records (8, 9, 11-14) as well.
export const subsetOptions = {
  targetFormat: 'woff2',
  preserveNameIds: [0, 1, 2, 3, 4, 5, 6, 8, 9, 11, 12, 13, 14],
};

/** @param {string} root the built client directory (dist/client) */
export async function subsetSiteFonts(root) {
  const pages = await files(root, /\.html$/);
  const texts = await Promise.all(
    [...pages, ...(await files(join(root, 'assets'), /\.(js|css)$/))].map((f) => readFile(f, 'utf8')),
  );
  const characters = collectCharacters(texts);
  const written = [];
  for (const weight of weights) {
    const bytes = await subsetFont(await readFile(source(weight)), characters, subsetOptions);
    const name = `zen-maru-gothic-${weight}-${createHash('sha256').update(bytes).digest('hex').slice(0, 12)}.woff2`;
    await writeFile(join(root, 'assets', name), bytes);
    written.push({ weight, href: `/assets/${name}`, size: bytes.length });
  }
  const head = fontHead(written);
  for (const page of pages) {
    const html = await readFile(page, 'utf8');
    if (!html.includes('</head>')) throw Error(`No </head> in ${page}`);
    await writeFile(page, html.replace('</head>', `${head}</head>`));
  }
  return { characters: [...characters].length, files: written };
}
