// Blurred stand-ins for the site's pictures, shown from the first paint until the picture itself
// arrives (a lazily loaded thumbnail scrolled into view, a cover on a slow connection), instead of
// an empty box. Each is the picture shrunk to a few pixels, drawn blurred by an SVG filter as the
// <img>'s own background, so it needs no script and no change to the components: the rules match
// the <img> by its src. A page carries the rules of its first pictures in its HTML; the rules of
// every picture on the site follow in one stylesheet loaded without blocking the page, which also
// covers the pages opened by in-app navigation.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import sharp from 'sharp';

/** Pixels on the longer side of the shrunk picture. */
export const PLACEHOLDER_SIDE = 10;
/** How many of a page's pictures, in document order, get their rule in the page itself. */
export const INLINE_PLACEHOLDERS = 16;
// Icons and logos are drawn small (16-38px): no stand-in for them.
const MIN_WIDTH = 64;

export type ImageTag = { src: string; width?: number };

/** The <img> tags of a page: their src and stated width. */
export function imageTags(html: string): ImageTag[] {
  return [...html.matchAll(/<img\b[^>]*>/gi)].flatMap(([tag]) => {
    const src = tag.match(/\ssrc="([^"]+)"/)?.[1];
    if (!src) return [];
    const width = tag.match(/\swidth="?(\d+)/)?.[1];
    return [{ src, ...(width ? { width: Number(width) } : {}) }];
  });
}

/** Whether a picture should get a stand-in: a raster picture of this site drawn larger than an icon. */
export const wantsPlaceholder = (tag: ImageTag) =>
  tag.src.startsWith('/') &&
  !tag.src.startsWith('//') &&
  /\.(webp|png|jpe?g|avif)$/i.test(tag.src) &&
  !(tag.width && tag.width < MIN_WIDTH);

/**
 * The CSS background of a stand-in: the tiny WebP inside an SVG that blurs it. The blur keeps the
 * edges opaque (the alpha is set back to 1 after it), so the picture does not fade out at its border.
 */
export function placeholderBackground(webp: Buffer, width: number, height: number) {
  const blur = (Math.max(width, height) / 12).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${width} ${height}' preserveAspectRatio='none'>` +
    `<filter id='b' color-interpolation-filters='sRGB'><feGaussianBlur stdDeviation='${blur}'/>` +
    `<feComponentTransfer><feFuncA type='discrete' tableValues='1 1'/></feComponentTransfer></filter>` +
    `<image width='${width}' height='${height}' preserveAspectRatio='none' filter='url(#b)' ` +
    `href='data:image/webp;base64,${webp.toString('base64')}'/></svg>`;
  return `url("data:image/svg+xml,${svg.replace(/[<>#%"]/g, encodeURIComponent)}")`;
}

/** The rule that puts the stand-in under one picture. */
export const placeholderRule = (src: string, background: string) =>
  `img[src="${src}"]{background-image:${background}}`;
// What every stand-in shares: it covers the picture's box like the picture does.
const SHARED = `background-size:cover;background-position:center;background-repeat:no-repeat`;

/**
 * The stand-in for one picture, or null for one with transparent parts (the stand-in would show
 * through them) or one sharp cannot read.
 */
async function render(file: string) {
  try {
    const image = sharp(file, { animated: false });
    const { isOpaque } = await image.stats();
    if (!isOpaque) return null;
    const { data, info } = await image
      .resize(PLACEHOLDER_SIDE, PLACEHOLDER_SIDE, { fit: 'inside' })
      .webp({ quality: 40, effort: 6, smartSubsample: true })
      .toBuffer({ resolveWithObject: true });
    return placeholderBackground(data, info.width, info.height);
  } catch {
    return null;
  }
}

/**
 * Adds the stand-ins to the built pages: each page's first pictures in a <style> in its head, and
 * the whole site's in /assets/placeholders-<hash>.css, linked from every page without blocking it.
 * @param root the built client directory (dist/client)
 * @param pages the HTML files under it
 * @param cacheFile where the stand-ins are kept between builds, by the picture's content
 */
export async function addPlaceholders(root: string, pages: string[], cacheFile?: string) {
  let cache: Record<string, string | null> = {};
  if (cacheFile)
    try {
      cache = JSON.parse(await readFile(cacheFile, 'utf8'));
    } catch {}
  const used: typeof cache = {};
  const html = await Promise.all(pages.map((page) => readFile(page, 'utf8')));
  const tags = html.map((page) => imageTags(page).filter(wantsPlaceholder));
  const backgrounds = new Map<string, string>();
  for (const src of new Set(tags.flat().map((t) => t.src))) {
    let bytes: Buffer;
    try {
      bytes = await readFile(join(root, decodeURI(src)));
    } catch {
      continue;
    }
    const key = createHash('sha256').update(bytes).digest('hex') + `:${PLACEHOLDER_SIDE}`;
    const background = key in cache ? cache[key] : await render(join(root, decodeURI(src)));
    used[key] = background;
    if (background) backgrounds.set(src, background);
  }
  if (cacheFile) {
    await mkdir(join(cacheFile, '..'), { recursive: true });
    await writeFile(cacheFile, JSON.stringify(used));
  }
  const rules = (sources: Iterable<string>) => {
    const list = [...new Set(sources)].filter((src) => backgrounds.has(src));
    return list.length
      ? list.map((src) => placeholderRule(src, backgrounds.get(src)!)).join('') +
          `${list.map((src) => `img[src="${src}"]`).join(',')}{${SHARED}}`
      : '';
  };
  const sheet = rules(backgrounds.keys());
  const name = `placeholders-${createHash('sha256').update(sheet).digest('hex').slice(0, 12)}.css`;
  if (sheet) await writeFile(join(root, 'assets', name), sheet);
  for (const [i, page] of pages.entries()) {
    const own = rules(tags[i].slice(0, INLINE_PLACEHOLDERS).map((t) => t.src));
    // `media="print"` loads it at the lowest priority without blocking the first paint; it applies
    // to the screen once it is in.
    const head =
      (own ? `<style>${own}</style>` : '') +
      (sheet ? `<link rel="stylesheet" href="/assets/${name}" media="print" onload="this.media='all'">` : '');
    if (!html[i].includes('</head>')) throw Error(`No </head> in ${page}`);
    await writeFile(page, html[i].replace('</head>', `${head}</head>`));
  }
  return { pictures: backgrounds.size, sheet: sheet.length };
}
