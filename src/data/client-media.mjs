// Resolves previews.json + image-cache.json into the small table the pages actually render
// (served to the app as `virtual:cp20-media`, see vite.config.ts). Source URLs of the images,
// check timestamps and unused entries stay out of the client bundle.

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
  /** @type {Record<string, {image?: string, srcset?: string, width: number, height: number, icon?: string}>} */
  const pages = {};
  for (const [page, p] of Object.entries(previews)) {
    const image = p.image ? cache[p.image] : undefined;
    const icon = p.icon ? cache[p.icon]?.file : undefined;
    /** @type {(typeof pages)[string]} */
    const entry = { width: p.width, height: p.height };
    if (image) {
      entry.image = image.file;
      if (image.variants?.length)
        entry.srcset = [
          ...image.variants.map((v) => `${v.file} ${v.width}w`),
          `${image.file} ${image.width || p.width}w`,
        ].join(', ');
    }
    if (icon) entry.icon = icon;
    pages[page] = entry;
  }
  /** @type {Record<string, string>} */
  const images = {};
  for (const source of thumbnails) if (source && cache[source]) images[source] = cache[source].file;
  return { pages, images };
}
