// Resolves previews.json + image-cache.json into the small table the pages actually render
// (served to the app as `virtual:cp20-media`, see vite.config.ts). Source URLs of the images,
// check timestamps and unused entries stay out of the client bundle. Also names the smaller WebP
// copies that scripts/sync/images.ts writes, so both sides agree on them.

export type Variant = { file: string; width: number };
export type Crop = { left: number; top: number; width: number; height: number };
export type CacheEntry = {
  file: string;
  checkedAt: string;
  width?: number;
  crop?: Crop;
  variants?: Variant[];
};
export type Preview = {
  image: string | null;
  icon: string | null;
  width: number;
  height: number;
  checkedAt?: string;
};

/** `/media/abc.png`, 320 → `/media/abc-320w.webp` */
export const variantFile = (file: string, width: number) =>
  file.replace(/\.[a-z0-9]+$/i, '') + `-${width}w.webp`;

/** Width of the single WebP copy of a site icon (shown at 26-38px, so this covers 2x screens). */
export const iconWidth = 96;

/** A path on this site (an image or icon committed under public/), not an image to fetch and cache. */
export const isLocal = (source: string) => source.startsWith('/');

/**
 * @param previews page URL → preview metadata
 * @param cache source image URL → cached file
 * @param thumbnails other source image URLs the pages show by source (music, manga)
 * @param committed srcset of each committed image (path → srcset, coverSrcsets), for a work's own
 *   picture stated in works.json (`image`: "/images/works/…"), shown as it is
 */
export function clientMedia(
  previews: Record<string, Preview>,
  cache: Record<string, CacheEntry>,
  thumbnails: (string | null | undefined)[],
  committed: Record<string, string> = {},
) {
  const srcset = (image: CacheEntry, fallbackWidth?: number) =>
    image.variants?.length
      ? [
          ...image.variants.map((v) => `${v.file} ${v.width}w`),
          `${image.file} ${image.width || fallbackWidth}w`,
        ].join(', ')
      : undefined;
  const pages: Record<
    string,
    { image?: string; srcset?: string; width: number; height: number; icon?: string }
  > = {};
  for (const [page, p] of Object.entries(previews)) {
    const image = p.image ? cache[p.image] : undefined;
    // Icons are shown at 22-38px: their small WebP copy when there is one, else the original. An
    // icon the site keeps itself (works.json `icon`: "/images/icons/…") is used as it is.
    const iconEntry = p.icon && !isLocal(p.icon) ? cache[p.icon] : undefined;
    const icon =
      p.icon && isLocal(p.icon)
        ? p.icon
        : iconEntry && (iconEntry.variants?.find((v) => v.width === iconWidth)?.file ?? iconEntry.file);
    const entry: (typeof pages)[string] = { width: p.width, height: p.height };
    if (p.image && isLocal(p.image)) {
      // Its WebP copies, the largest at full size, as for the covers and screenshots.
      entry.image = p.image;
      if (committed[p.image]) entry.srcset = committed[p.image];
    } else if (image) {
      entry.image = image.file;
      const candidates = srcset(image, p.width);
      if (candidates) entry.srcset = candidates;
    }
    if (icon) entry.icon = icon;
    pages[page] = entry;
  }
  const images: Record<string, { src: string; srcset?: string }> = {};
  for (const source of thumbnails) {
    if (!source || !cache[source]) continue;
    const image = cache[source];
    // A cropped thumbnail (YouTube's letterboxed 4:3 file) is shown only as its cut-out copies.
    if (image.crop && image.variants?.length) {
      images[source] = {
        src: image.variants.at(-1)!.file,
        srcset: image.variants.map((v) => `${v.file} ${v.width}w`).join(', '),
      };
      continue;
    }
    const candidates = image.width ? srcset(image) : undefined;
    images[source] = candidates ? { src: image.file, srcset: candidates } : { src: image.file };
  }
  return { pages, images };
}

/**
 * srcset of each cover under public/images/covers from the WebP copies next to it (written by
 * scripts/sync/images.ts as `name-<width>w.webp`), so every descriptor is the copy's real width.
 * @param names file names in the covers directory
 * @param directory its public path
 * @returns cover path → srcset
 */
export function coverSrcsets(names: string[], directory = '/images/covers/') {
  const covers: Record<string, string> = {};
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
