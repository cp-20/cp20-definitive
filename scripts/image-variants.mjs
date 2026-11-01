// Smaller WebP copies of the images the pages show smaller than their files: the cached OG images
// (article rows, the works grid), music and manga thumbnails, site icons and the manga covers.
// Variants only shrink and re-encode an image, so the artwork, colours and aspect ratio are
// unchanged; for cached images the original file stays the largest srcset candidate.
import { access, readFile, readdir, writeFile, rename, rm, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { variantFile, iconWidth } from '../src/data/variant-names.mjs';

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
async function writeVariant(original, file, width) {
  const target = publicUrl(file);
  if (await exists(target)) return false;
  const temporary = new URL(target.href + '.tmp');
  try {
    await writeFile(
      temporary,
      await sharp(publicUrl(original).pathname)
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer(),
    );
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return true;
}

/**
 * Adds `width` and `variants` to the image-cache entries whose source is in `sources` (shown as
 * thumbnails: OG images, music and manga thumbnails) or `icons` (site icons, which get one
 * `iconWidth` copy), writing any missing variant files next to the original. Other entries lose
 * stale variant fields.
 * @param {Record<string, {file: string, checkedAt: string, width?: number, variants?: {file: string, width: number}[]}>} cache
 * @param {Set<string>} sources source URLs that are displayed as thumbnails
 * @param {Set<string>} [icons] source URLs that are displayed as site icons
 */
export async function addVariants(cache, sources, icons = new Set()) {
  let written = 0;
  for (const [source, entry] of Object.entries(cache)) {
    delete entry.width;
    delete entry.variants;
    const thumbnail = sources.has(source);
    const icon = icons.has(source);
    if ((!thumbnail && !icon) || /\.(gif|ico|svg)$/i.test(entry.file)) continue;
    let width;
    try {
      width = (await sharp(publicUrl(entry.file).pathname).metadata()).width;
    } catch {
      continue;
    }
    const widths = new Set(thumbnail ? plannedWidths(width ?? 0) : []);
    if (icon && (width ?? 0) >= iconWidth * 1.25) widths.add(iconWidth);
    const variants = [];
    for (const w of [...widths].sort((a, b) => a - b)) {
      const file = variantFile(entry.file, w);
      try {
        const fresh = await writeVariant(entry.file, file, w);
        // Small, flat icons can be smaller as PNG than as WebP: a copy that saves nothing is dropped.
        if ((await stat(publicUrl(file))).size >= (await stat(publicUrl(entry.file))).size) {
          await rm(publicUrl(file), { force: true });
          continue;
        }
        if (fresh) written++;
      } catch {
        // A corrupt original (intact header, broken body) must not stop the whole run: the entry
        // keeps only its original file.
        console.warn(`Image variants: ${entry.file} could not be resized; kept without variants`);
        variants.length = 0;
        break;
      }
      variants.push({ file, width: w });
    }
    entry.width = width;
    if (variants.length) entry.variants = variants;
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
export const thumbnailSources = (previews, items) =>
  new Set([...ogSources(previews), ...items.map((i) => i.thumbnail).filter(Boolean)]);

// `npm run cache:images -- --variants-only` equivalent: regenerate variants without fetching.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest = new URL('../src/data/image-cache.json', import.meta.url);
  const cache = JSON.parse(await readFile(manifest, 'utf8'));
  const load = async (name) =>
    JSON.parse(await readFile(new URL(`../src/data/${name}.json`, import.meta.url), 'utf8'));
  const [previews, tracks, series] = await Promise.all(['previews', 'tracks', 'series'].map(load));
  const written =
    (await addVariants(cache, thumbnailSources(previews, [...tracks, ...series]), iconSources(previews))) +
    (await addCoverVariants());
  await writeFile(new URL(manifest.href + '.tmp'), JSON.stringify(cache, null, 2) + '\n');
  await rename(new URL(manifest.href + '.tmp'), manifest);
  console.log(`Image variants: ${written} written`);
}
