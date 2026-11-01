// Resolves previews.json + image-cache.json into the small table the pages actually render
// (served to the app as `virtual:cp20-media`, see vite.config.ts). Source URLs of the images,
// check timestamps and unused entries stay out of the client bundle.
import { iconWidth } from './variant-names.mjs';

/**
 * @typedef {{file: string, width?: number, variants?: {file: string, width: number}[]}} CacheEntry
 * @typedef {{image: string|null, icon: string|null, width: number, height: number}} Preview
 */

/**
 * @param {Record<string, Preview>} previews page URL → preview metadata
 * @param {Record<string, CacheEntry>} cache source image URL → cached file
 * @param {(string|null|undefined)[]} thumbnails other source image URLs the pages show by source (music, manga)
 */
export function clientMedia(previews, cache, thumbnails) {
  /** @param {CacheEntry} image @param {number} [fallbackWidth] */
  const srcset = (image, fallbackWidth) =>
    image.variants?.length
      ? [
          ...image.variants.map((v) => `${v.file} ${v.width}w`),
          `${image.file} ${image.width || fallbackWidth}w`,
        ].join(', ')
      : undefined;
  /** @type {Record<string, {image?: string, srcset?: string, width: number, height: number, icon?: string}>} */
  const pages = {};
  for (const [page, p] of Object.entries(previews)) {
    const image = p.image ? cache[p.image] : undefined;
    // Icons are shown at 26-38px: their small WebP copy when there is one, else the original.
    const iconEntry = p.icon ? cache[p.icon] : undefined;
    const icon =
      iconEntry && (iconEntry.variants?.find((v) => v.width === iconWidth)?.file ?? iconEntry.file);
    /** @type {(typeof pages)[string]} */
    const entry = { width: p.width, height: p.height };
    if (image) {
      entry.image = image.file;
      const candidates = srcset(image, p.width);
      if (candidates) entry.srcset = candidates;
    }
    if (icon) entry.icon = icon;
    pages[page] = entry;
  }
  /** @type {Record<string, {src: string, srcset?: string}>} */
  const images = {};
  for (const source of thumbnails) {
    const image = source ? cache[source] : undefined;
    if (!image || !source) continue;
    const candidates = image.width ? srcset(image) : undefined;
    images[source] = candidates ? { src: image.file, srcset: candidates } : { src: image.file };
  }
  return { pages, images };
}

/**
 * srcset of each cover under public/images/covers from the WebP copies next to it (written by
 * scripts/image-variants.mjs as `name-<width>w.webp`), so every descriptor is the copy's real width.
 * @param {string[]} names file names in the covers directory
 * @param {string} [directory] its public path
 * @returns {Record<string, string>} cover path → srcset
 */
export function coverSrcsets(names, directory = '/images/covers/') {
  /** @type {Record<string, string>} */
  const covers = {};
  for (const name of names) {
    if (!/\.(jpe?g|png)$/i.test(name)) continue;
    const stem = name.replace(/\.[a-z0-9]+$/i, '');
    const copies = names
      .map((n) => n.startsWith(stem + '-') && n.slice(stem.length + 1).match(/^(\d+)w\.webp$/))
      .filter((m) => !!m)
      .map((m) => Number(m[1]))
      .sort((a, b) => a - b);
    if (copies.length)
      covers[directory + name] = copies.map((w) => `${directory}${stem}-${w}w.webp ${w}w`).join(', ');
  }
  return covers;
}
