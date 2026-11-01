// Smaller WebP copies of the cached OG images for thumbnails (article rows, the works grid).
// The original file stays the largest srcset candidate; variants only shrink and re-encode it, so
// the artwork, colours and aspect ratio are unchanged.
import { access, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

export const variantWidths = [320, 640, 960];

/**
 * Widths worth generating for an image `naturalWidth` px wide: only real reductions (at least 20%
 * narrower than the original), so the original remains the sharpest candidate.
 * @param {number} naturalWidth
 */
export const plannedWidths = (naturalWidth) =>
  naturalWidth > 0 ? variantWidths.filter((w) => w <= naturalWidth * 0.8) : [];

/** `/media/abc.png`, 320 → `/media/abc-320w.webp` */
export const variantFile = (file, width) => file.replace(/\.[a-z0-9]+$/i, '') + `-${width}w.webp`;

/** @param {string} file a `/media/…` variant or original path */
export const isVariantFile = (file) => /-\d+w\.webp$/.test(file);

const publicUrl = (file) => new URL(`../public${file}`, import.meta.url);
const exists = (url) =>
  access(url)
    .then(() => true)
    .catch(() => false);

/**
 * Adds `width` and `variants` to the image-cache entries whose source is in `sources`, writing any
 * missing variant files next to the original. Entries for other sources lose stale variant fields.
 * @param {Record<string, {file: string, checkedAt: string, width?: number, variants?: {file: string, width: number}[]}>} cache
 * @param {Set<string>} sources source URLs that are displayed as OG images
 */
export async function addVariants(cache, sources) {
  let written = 0;
  for (const [source, entry] of Object.entries(cache)) {
    delete entry.width;
    delete entry.variants;
    if (!sources.has(source) || /\.(gif|ico)$/i.test(entry.file)) continue;
    let width;
    try {
      width = (await sharp(publicUrl(entry.file).pathname).metadata()).width;
    } catch {
      continue;
    }
    const variants = [];
    for (const w of plannedWidths(width ?? 0)) {
      const file = variantFile(entry.file, w);
      const target = publicUrl(file);
      if (!(await exists(target))) {
        const temporary = new URL(target.href + '.tmp');
        try {
          await writeFile(
            temporary,
            await sharp(publicUrl(entry.file).pathname)
              .resize({ width: w, withoutEnlargement: true })
              .webp({ quality: 80 })
              .toBuffer(),
          );
          await rename(temporary, target);
        } catch {
          // A corrupt original (intact header, broken body) must not stop the whole run: the entry
          // keeps only its original file.
          await rm(temporary, { force: true });
          console.warn(`Image variants: ${entry.file} could not be resized; kept without variants`);
          variants.length = 0;
          break;
        }
        written++;
      }
      variants.push({ file, width: w });
    }
    entry.width = width;
    if (variants.length) entry.variants = variants;
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

// `npm run cache:images -- --variants-only` equivalent: regenerate variants without fetching.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest = new URL('../src/data/image-cache.json', import.meta.url);
  const cache = JSON.parse(await readFile(manifest, 'utf8'));
  const previews = JSON.parse(await readFile(new URL('../src/data/previews.json', import.meta.url), 'utf8'));
  const written = await addVariants(cache, ogSources(previews));
  await writeFile(new URL(manifest.href + '.tmp'), JSON.stringify(cache, null, 2) + '\n');
  await rename(new URL(manifest.href + '.tmp'), manifest);
  console.log(`Image variants: ${written} written`);
}
