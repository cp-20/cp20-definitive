// The images the pages show, saved under public/media so the site never loads a third-party image:
// the OG images and site icons of previews.json and the music and manga thumbnails, recorded in
// image-cache.json by source URL. Each file is checked to be a decodable raster of at most 15 MB
// and named by its content hash. Then the smaller WebP copies the pages pick from with srcset:
// they only shrink and re-encode an image, so the artwork, colours and aspect ratio are unchanged,
// and for cached images the original file stays the largest candidate. The one exception is the
// YouTube thumbnails (`framed`): 4:3 files with the 16:9 video letterboxed inside, sometimes with
// the video's own black bars or pillars as well, whose copies are the 16:9 picture cut out of the
// bands (see `framedCrop`).
//
// npm run cache:images [-- --force]: refreshes the cache without the rest of the sync.
// node scripts/sync/images.ts --variants-only: rewrites the WebP copies (and those of the covers
// in public/images/covers) without fetching anything.
import { readFile, writeFile, mkdir, rename, readdir, unlink, access, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { imageSize } from 'image-size';
import sharp from 'sharp';
import { variantFile, iconWidth, type CacheEntry, type Crop, type Variant } from '../../src/content/media.ts';
import { shownSeriesThumbnail } from '../../src/data/manga-covers.ts';

type Cache = Record<string, CacheEntry>;
type Preview = { image?: string | null; icon?: string | null; width?: number; height?: number };
type Thumbnail = { thumbnail?: string | null };

const directory = new URL('../../public/media/', import.meta.url);
const data = (name: string) => new URL(`../../src/data/${name}.json`, import.meta.url);
const load = (name: string) => readFile(data(name), 'utf8').then(JSON.parse);
const publicUrl = (file: string) => new URL(`../../public${file}`, import.meta.url);
const exists = (url: URL) =>
  access(url)
    .then(() => true)
    .catch(() => false);
async function writeJson(file: URL, value: unknown) {
  await writeFile(new URL(file.href + '.tmp'), JSON.stringify(value, null, 2) + '\n');
  await rename(new URL(file.href + '.tmp'), file);
}

// ── Accepting an image ──
export const maxImageBytes = 15_000_000;
export function rasterExtension(bytes: Buffer) {
  const type = imageSize(bytes).type ?? '';
  const extensions: Record<string, string> = {
    jpg: 'jpg',
    png: 'png',
    gif: 'gif',
    webp: 'webp',
    avif: 'avif',
    ico: 'ico',
  };
  if (!extensions[type]) throw Error('Unsupported image format');
  return extensions[type];
}
/**
 * Like rasterExtension, but also decodes the whole image (ICO aside, which sharp cannot read), so a
 * file whose header is intact but whose body is truncated or corrupt is rejected before it is cached.
 */
export async function decodableRaster(bytes: Buffer) {
  const ext = rasterExtension(bytes);
  if (ext !== 'ico') {
    try {
      await sharp(bytes).stats();
    } catch {
      throw Error('Undecodable image');
    }
  }
  return ext;
}
/** Downloads an image, failing on an error response or once it passes maxImageBytes. */
async function download(url: string | URL, fetcher: typeof fetch = fetch) {
  const response = await fetcher(url, {
    signal: AbortSignal.timeout(20000),
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; cp20.dev image collector)' },
  });
  if (!response.ok) throw Error('Image unavailable');
  const parts: Uint8Array[] = [];
  let total = 0;
  for await (const part of response.body!) {
    total += part.length;
    if (total > maxImageBytes) throw Error('Image too large');
    parts.push(part);
  }
  return Buffer.concat(parts);
}
// Metadata sizes come from third-party pages: only plausible positive integers are kept.
export const size = (value: unknown, fallback: number) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 10000 ? n : fallback;
};
// A new OG image is accepted only when the cache would also accept it (raster, at most 15 MB);
// otherwise the page keeps its previous image and the previously cached file.
export async function dimensions(url: string, fetcher: typeof fetch = fetch) {
  const bytes = await download(url, fetcher);
  await decodableRaster(bytes);
  const result = imageSize(bytes);
  return { width: size(result.width, 1200), height: size(result.height, 630) };
}

// ── Which images the pages show ──
/**
 * Pages whose site icon the pages show: only the works (OriginalIcon in Projects.tsx and the works
 * grid). Articles show their OG image alone, so the platforms' logos in their previews are not cached.
 */
export const iconPages = (works: { url: string }[]) => new Set(works.map((w) => w.url));
/** Source URLs of the site icons in previews.json that the pages show (`pages` from iconPages). */
export const iconSources = (previews: Record<string, Preview>, pages: Set<string>) =>
  new Set(
    Object.entries(previews)
      .filter(([page]) => pages.has(page))
      .map(([, p]) => p.icon)
      .filter((icon): icon is string => !!icon),
  );
/**
 * The music and manga entries whose thumbnails the pages show: every track, and only the series
 * without a committed volume 1 cover (the others never display their publisher thumbnail).
 */
export const shownItems = (tracks: Thumbnail[], series: { title: string; thumbnail?: string | null }[]) => [
  ...tracks,
  ...series.map((s) => ({ thumbnail: shownSeriesThumbnail(s) })),
];
/** Every cached source shown as a thumbnail: OG images plus the music and manga thumbnails. */
export const thumbnailSources = (previews: Record<string, Preview>, items: Thumbnail[]) =>
  new Set(
    [...Object.values(previews).map((p) => p.image), ...items.map((i) => i.thumbnail)].filter(
      (source): source is string => !!source,
    ),
  );
/** The YouTube thumbnails among tracks.json entries (4:3 files around a 16:9 video). */
export const framedSources = (tracks: Thumbnail[]) =>
  new Set(
    tracks
      .map((t) => t.thumbnail)
      .filter((u): u is string => typeof u === 'string' && new URL(u).hostname === 'i.ytimg.com'),
  );

// ── Caching ──
/**
 * @param previousPreviews previews.json as it was before this run's syncPreviews; pages whose new
 *   image or icon cannot be cached fall back to these entries (and their cached files) instead of
 *   losing the image.
 */
export async function cacheImages(force = false, previousPreviews?: Record<string, Preview>) {
  await mkdir(directory, { recursive: true });
  const [previews, tracks, series, works, previous]: [
    Record<string, Preview>,
    Thumbnail[],
    { title: string; thumbnail?: string }[],
    { url: string }[],
    Cache,
  ] = await Promise.all([
    load('previews'),
    load('tracks'),
    load('series'),
    load('works'),
    load('image-cache').catch(() => ({})),
  ]);
  // Only the icons the pages show (the works'): the article previews' platform logos stay uncached.
  const shownIcons = iconPages(works);
  const icons = iconSources(previews, shownIcons);
  const urls = [
    ...new Set(
      [
        ...Object.values(previews).map((p) => p.image),
        ...icons,
        ...shownItems(tracks, series).map((i) => i.thumbnail),
      ].filter((source): source is string => !!source),
    ),
  ];
  const next: Cache = {};
  let refreshed = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let source; (source = urls.shift()); ) {
        const old = previous[source];
        const kept = old && (await exists(publicUrl(old.file)));
        // A copy: addVariants rewrites entries in place, and `previous` must stay as it was for the
        // change check below (a run that only adds or drops variants is still a change).
        if (kept) next[source] = structuredClone(old);
        if (!force && kept && Date.now() - Date.parse(old.checkedAt) < 7 * 86400000) continue;
        try {
          const url = new URL(source);
          if (url.protocol !== 'https:' || url.username || url.password) throw Error('Invalid source');
          const bytes = await download(url);
          const ext = await decodableRaster(bytes);
          const filename = `${createHash('sha256').update(bytes).digest('hex').slice(0, 24)}.${ext}`;
          const file = new URL(filename, directory);
          const temporary = new URL(
            `${filename}.${createHash('sha256').update(source).digest('hex').slice(0, 8)}.tmp`,
            directory,
          );
          await writeFile(temporary, bytes);
          await rename(temporary, file);
          next[source] = { file: `/media/${filename}`, checkedAt: new Date().toISOString() };
          refreshed++;
        } catch {
          console.warn(
            `Image cache: ${new URL(source).hostname}; ${kept ? 'kept previous file' : 'unavailable or unsupported raster'}`,
          );
        }
      }
    }),
  );
  if (previousPreviews) {
    let previewsReverted = false;
    for (const [page, preview] of Object.entries(previews)) {
      const before = previousPreviews[page];
      for (const field of ['image', 'icon'] as const) {
        if (field === 'icon' && !shownIcons.has(page)) continue;
        const source = preview[field];
        const fallback = before?.[field];
        if (!source || next[source] || !fallback || fallback === source || !previous[fallback]) continue;
        if (!(await exists(publicUrl(previous[fallback].file)))) continue;
        next[fallback] = structuredClone(previous[fallback]);
        preview[field] = fallback;
        if (field === 'image') Object.assign(preview, { width: before.width, height: before.height });
        previewsReverted = true;
        console.warn(`Image cache: ${new URL(page).hostname}; new ${field} not cached, kept previous one`);
      }
    }
    if (previewsReverted) await writeJson(data('previews'), previews);
  }
  await addVariants(
    next,
    thumbnailSources(previews, shownItems(tracks, series)),
    icons,
    framedSources(tracks),
  );
  const files = (entry: CacheEntry) => [entry.file, ...(entry.variants ?? []).map((v) => v.file)];
  const content = (object: Cache) =>
    Object.fromEntries(
      Object.keys(object)
        .sort()
        .map((k) => [k, files(object[k])]),
    );
  const changed = JSON.stringify(content(next)) !== JSON.stringify(content(previous));
  await writeJson(
    data('image-cache'),
    Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b))),
  );
  const used = new Set(Object.values(next).flatMap((p) => files(p).map((f) => f.split('/').at(-1))));
  for (const filename of await readdir(directory))
    if (!used.has(filename)) await unlink(new URL(filename, directory));
  console.log(
    `Image cache: ${Object.keys(next).length} source URLs, ${used.size} local files, ${refreshed} refreshed`,
  );
  return changed;
}

// ── Smaller copies ──
export const variantWidths = [320, 480, 640, 960];
/**
 * Widths worth generating for an image `naturalWidth` px wide: only real reductions (at least 20%
 * narrower than the original), so the original remains the sharpest candidate.
 */
export const plannedWidths = (naturalWidth: number) =>
  naturalWidth > 0 ? variantWidths.filter((w) => w <= naturalWidth * 0.8) : [];

/**
 * Writes `width`-px WebP copy `file` of `original` (both `/…` public paths) unless it exists.
 * @returns whether a file was written
 */
async function writeVariant(original: string, file: string, width: number, crop?: Crop) {
  const target = publicUrl(file);
  if (await exists(target)) return false;
  const temporary = new URL(target.href + '.tmp');
  try {
    const image = sharp(publicUrl(original).pathname);
    if (crop) image.extract(crop);
    await writeFile(
      temporary,
      await image.resize({ width, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(),
    );
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return true;
}

// A row or column is part of a band when nearly all its pixels share one brightness (JPEG noise
// aside): the 2nd-98th percentile spread of its luminance is below this.
const bandSpread = 12;
// Lines this thin at one edge are trimmed even when the opposite edge has none (a stray dark line).
const edgeLine = 4;

/**
 * The 16:9 picture inside a `width`×`height` greyscale image: uniform bands at the edges are cut
 * off, then the largest centred 16:9 rectangle of what remains. Letterbox and pillarbox bands come
 * in pairs, so each axis is trimmed by the thinner of its two bands (plus thin edge lines): a flat
 * area on one side of the artwork itself is kept.
 * @param gray one luminance byte per pixel, row by row
 */
export function framedCrop(gray: Uint8Array, width: number, height: number): Crop {
  const spread = (values: number[]) => {
    values.sort((a, b) => a - b);
    return values[Math.floor(values.length * 0.98)] - values[Math.floor(values.length * 0.02)];
  };
  const row = (y: number, x0: number, x1: number) =>
    spread(Array.from(gray.subarray(y * width + x0, y * width + x1)));
  const column = (x: number, y0: number, y1: number) => {
    const values = [];
    for (let y = y0; y < y1; y++) values.push(gray[y * width + x]);
    return spread(values);
  };
  const pair = (start: number, end: number) => {
    const both = Math.min(start, end);
    return [start - both <= edgeLine ? start : both, end - both <= edgeLine ? end : both];
  };
  let top = 0;
  while (top < height * 0.4 && row(top, 0, width) < bandSpread) top++;
  let bottom = 0;
  while (bottom < height * 0.4 && row(height - 1 - bottom, 0, width) < bandSpread) bottom++;
  [top, bottom] = pair(top, bottom);
  let left = 0;
  while (left < width * 0.4 && column(left, top, height - bottom) < bandSpread) left++;
  let right = 0;
  while (right < width * 0.4 && column(width - 1 - right, top, height - bottom) < bandSpread) right++;
  [left, right] = pair(left, right);
  const w = width - left - right,
    h = height - top - bottom;
  const cropWidth = Math.min(w, Math.round((h * 16) / 9)),
    cropHeight = Math.min(h, Math.round((w * 9) / 16));
  return {
    left: left + Math.floor((w - cropWidth) / 2),
    top: top + Math.floor((h - cropHeight) / 2),
    width: cropWidth,
    height: cropHeight,
  };
}

/** `/media/abc.jpg` cut to `crop`, `width` px wide → `/media/abc-<crop>-<width>w.webp` */
const croppedFile = (file: string, crop: Crop, width: number) =>
  file.replace(/\.[a-z0-9]+$/i, '') + `-${crop.left}-${crop.top}-${crop.width}x${crop.height}-${width}w.webp`;

/**
 * Adds `width` and `variants` to the image-cache entries whose source is in `sources` (shown as
 * thumbnails: OG images, music and manga thumbnails) or `icons` (site icons, which get one
 * `iconWidth` copy), writing any missing variant files next to the original. Other entries lose
 * stale variant fields. Entries in `framed` (also thumbnails) get `crop` and copies of the 16:9
 * picture only, the largest at its full size, which the pages use instead of the original.
 */
export async function addVariants(
  cache: Cache,
  sources: Set<string>,
  icons = new Set<string>(),
  framed = new Set<string>(),
) {
  let written = 0;
  for (const [source, entry] of Object.entries(cache)) {
    delete entry.width;
    delete entry.variants;
    delete entry.crop;
    const thumbnail = sources.has(source);
    const icon = icons.has(source);
    if ((!thumbnail && !icon) || /\.(gif|ico|svg)$/i.test(entry.file)) continue;
    let width;
    try {
      width = (await sharp(publicUrl(entry.file).pathname).metadata()).width;
    } catch {
      continue;
    }
    let crop: Crop | undefined;
    if (thumbnail && framed.has(source)) {
      try {
        const { data, info } = await sharp(publicUrl(entry.file).pathname)
          .greyscale()
          .raw()
          .toBuffer({ resolveWithObject: true });
        crop = framedCrop(data, info.width, info.height);
      } catch {
        continue;
      }
    }
    const widths = new Set(thumbnail ? plannedWidths(crop?.width ?? width ?? 0) : []);
    if (crop) widths.add(crop.width);
    if (icon && (width ?? 0) >= iconWidth * 1.25) widths.add(iconWidth);
    const variants: Variant[] = [];
    for (const w of [...widths].sort((a, b) => a - b)) {
      const file = crop ? croppedFile(entry.file, crop, w) : variantFile(entry.file, w);
      try {
        const fresh = await writeVariant(entry.file, file, w, crop);
        // Small, flat icons can be smaller as PNG than as WebP: a copy that saves nothing is dropped.
        if (!crop && (await stat(publicUrl(file))).size >= (await stat(publicUrl(entry.file))).size) {
          await rm(publicUrl(file), { force: true });
          continue;
        }
        if (fresh) written++;
      } catch {
        // A corrupt original (intact header, broken body) must not stop the whole run: the entry
        // keeps only its original file and, like one whose size cannot be read, no width (the
        // tests require a variant for every thumbnail with a recorded width over 400px).
        console.warn(`Image variants: ${entry.file} could not be resized; kept without variants`);
        variants.length = 0;
        crop = undefined;
        width = undefined;
        break;
      }
      variants.push({ file, width: w });
    }
    if (width !== undefined) entry.width = width;
    if (variants.length) entry.variants = variants;
    if (crop) entry.crop = crop;
  }
  return written;
}

/**
 * Widths of the WebP copies of a cover `naturalWidth` px wide: a thumbnail-sized one when that is a
 * real reduction, and one at full size (the covers are JPEGs; WebP is smaller at the same size).
 */
export const coverWidths = (naturalWidth: number) =>
  naturalWidth >= 300 ? [240, naturalWidth] : [naturalWidth];

/**
 * Writes the WebP copies of every JPEG/PNG cover in public/images/covers. The covers are committed
 * files (not part of the image cache); vite.config.ts finds the copies by name (coverSrcsets).
 */
async function addCoverVariants() {
  let written = 0;
  for (const name of await readdir(publicUrl('/images/covers/'))) {
    if (!/\.(jpe?g|png)$/i.test(name)) continue;
    const original = `/images/covers/${name}`;
    const { width } = await sharp(publicUrl(original).pathname).metadata();
    for (const w of coverWidths(width ?? 0))
      if (await writeVariant(original, variantFile(original, w), w)) written++;
  }
  return written;
}

async function variantsOnly() {
  const [cache, previews, tracks, series, works] = await Promise.all(
    ['image-cache', 'previews', 'tracks', 'series', 'works'].map(load),
  );
  const written =
    (await addVariants(
      cache,
      thumbnailSources(previews, shownItems(tracks, series)),
      iconSources(previews, iconPages(works)),
      framedSources(tracks),
    )) + (await addCoverVariants());
  await writeJson(data('image-cache'), cache);
  console.log(`Image variants: ${written} written`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--variants-only')) await variantsOnly();
  else await cacheImages(process.argv.includes('--force'));
}
