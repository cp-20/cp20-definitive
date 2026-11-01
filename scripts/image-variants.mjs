// Smaller WebP copies of the images the pages show smaller than their files: the cached OG images
// (article rows, the works grid), music and manga thumbnails, site icons and the manga covers.
// Variants only shrink and re-encode an image, so the artwork, colours and aspect ratio are
// unchanged; for cached images the original file stays the largest srcset candidate. The one
// exception is the YouTube thumbnails (`framed`): those are 4:3 files with the 16:9 video
// letterboxed inside, sometimes with the video's own black bars or pillars as well, so their
// copies are the 16:9 picture cut out of the bands (see `framedCrop`).
import { access, readFile, readdir, writeFile, rename, rm, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { variantFile, iconWidth } from '../src/data/variant-names.mjs';
import { shownSeriesThumbnail } from '../src/data/manga-covers.mjs';

export { variantFile, iconWidth };

export const variantWidths = [320, 640, 960];

/**
 * Widths worth generating for an image `naturalWidth` px wide: only real reductions (at least 20%
 * narrower than the original), so the original remains the sharpest candidate.
 * @param {number} naturalWidth
 */
export const plannedWidths = (naturalWidth) =>
  naturalWidth > 0 ? variantWidths.filter((w) => w <= naturalWidth * 0.8) : [];

/** @param {string} file a `/media/…` variant or original path */
export const isVariantFile = (file) => /-\d+w\.webp$/.test(file);

const publicUrl = (file) => new URL(`../public${file}`, import.meta.url);
const exists = (url) =>
  access(url)
    .then(() => true)
    .catch(() => false);

/**
 * Writes `width`-px WebP copy `file` of `original` (both `/…` public paths) unless it exists.
 * @returns {Promise<boolean>} whether a file was written
 */
async function writeVariant(original, file, width, crop) {
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
 * @param {Uint8Array} gray one luminance byte per pixel, row by row
 * @param {number} width
 * @param {number} height
 * @returns {{left: number, top: number, width: number, height: number}}
 */
export function framedCrop(gray, width, height) {
  const spread = (values) => {
    values.sort((a, b) => a - b);
    return values[Math.floor(values.length * 0.98)] - values[Math.floor(values.length * 0.02)];
  };
  const row = (y, x0, x1) => spread(Array.from(gray.subarray(y * width + x0, y * width + x1)));
  const column = (x, y0, y1) => {
    const values = [];
    for (let y = y0; y < y1; y++) values.push(gray[y * width + x]);
    return spread(values);
  };
  const pair = (start, end) => {
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
export const croppedFile = (file, crop, width) =>
  file.replace(/\.[a-z0-9]+$/i, '') + `-${crop.left}-${crop.top}-${crop.width}x${crop.height}-${width}w.webp`;

/**
 * Adds `width` and `variants` to the image-cache entries whose source is in `sources` (shown as
 * thumbnails: OG images, music and manga thumbnails) or `icons` (site icons, which get one
 * `iconWidth` copy), writing any missing variant files next to the original. Other entries lose
 * stale variant fields. Entries in `framed` (also thumbnails) get `crop` and copies of the 16:9
 * picture only, the largest at its full size, which the pages use instead of the original.
 * @param {Record<string, {file: string, checkedAt: string, width?: number, variants?: {file: string, width: number}[]}>} cache
 * @param {Set<string>} sources source URLs that are displayed as thumbnails
 * @param {Set<string>} [icons] source URLs that are displayed as site icons
 * @param {Set<string>} [framed] thumbnail source URLs to cut to their 16:9 picture
 */
export async function addVariants(cache, sources, icons = new Set(), framed = new Set()) {
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
    let crop;
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
    const variants = [];
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
 * @param {number} naturalWidth
 */
export const coverWidths = (naturalWidth) => (naturalWidth >= 300 ? [240, naturalWidth] : [naturalWidth]);

/**
 * Writes the WebP copies of every JPEG/PNG cover in public/images/covers. The covers are committed
 * files (not part of the image cache); vite.config.ts finds the copies by name (coverSrcsets).
 * @param {URL} [directory]
 */
export async function addCoverVariants(directory = publicUrl('/images/covers/')) {
  let written = 0;
  const base = new URL('../public/', import.meta.url).pathname;
  for (const name of await readdir(directory)) {
    if (!/\.(jpe?g|png)$/i.test(name)) continue;
    const original = new URL(name, directory).pathname.slice(base.length - 1);
    const { width } = await sharp(publicUrl(original).pathname).metadata();
    for (const w of coverWidths(width ?? 0))
      if (await writeVariant(original, variantFile(original, w), w)) written++;
  }
  return written;
}

/** Source URLs of the OG images in previews.json. */
export const ogSources = (previews) =>
  new Set(
    Object.values(previews)
      .map((p) => p.image)
      .filter(Boolean),
  );

/** Source URLs of the site icons in previews.json. */
export const iconSources = (previews) =>
  new Set(
    Object.values(previews)
      .map((p) => p.icon)
      .filter(Boolean),
  );

/**
 * Every cached source shown as a thumbnail: OG images plus the music and manga thumbnails.
 * @param {Record<string, {image?: string|null}>} previews
 * @param {{thumbnail?: string|null}[]} items tracks.json and series.json entries
 */
/**
 * The music and manga entries whose thumbnails the pages show: every track, and only the series
 * without a committed volume 1 cover (the others never display their publisher thumbnail).
 * @param {{thumbnail?: string|null}[]} tracks
 * @param {{title: string, thumbnail?: string|null}[]} series
 */
export const shownItems = (tracks, series) => [
  ...tracks,
  ...series.map((s) => ({ thumbnail: shownSeriesThumbnail(s) })),
];

export const thumbnailSources = (previews, items) =>
  new Set([...ogSources(previews), ...items.map((i) => i.thumbnail).filter(Boolean)]);

/**
 * The YouTube thumbnails among tracks.json entries (4:3 files around a 16:9 video).
 * @param {{thumbnail?: string|null}[]} tracks
 */
export const framedSources = (tracks) =>
  new Set(
    tracks
      .map((t) => t.thumbnail)
      .filter((u) => typeof u === 'string' && new URL(u).hostname === 'i.ytimg.com'),
  );

// `npm run cache:images -- --variants-only` equivalent: regenerate variants without fetching.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest = new URL('../src/data/image-cache.json', import.meta.url);
  const cache = JSON.parse(await readFile(manifest, 'utf8'));
  const load = async (name) =>
    JSON.parse(await readFile(new URL(`../src/data/${name}.json`, import.meta.url), 'utf8'));
  const [previews, tracks, series] = await Promise.all(['previews', 'tracks', 'series'].map(load));
  const written =
    (await addVariants(
      cache,
      thumbnailSources(previews, shownItems(tracks, series)),
      iconSources(previews),
      framedSources(tracks),
    )) + (await addCoverVariants());
  await writeFile(new URL(manifest.href + '.tmp'), JSON.stringify(cache, null, 2) + '\n');
  await rename(new URL(manifest.href + '.tmp'), manifest);
  console.log(`Image variants: ${written} written`);
}
