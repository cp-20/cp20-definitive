import { readFile, writeFile, mkdir, rename, readdir, unlink, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { imageSize } from 'image-size';
const directory = new URL('../public/media/', import.meta.url);
const manifestFile = new URL('../src/data/image-cache.json', import.meta.url);
export function rasterExtension(bytes) {
  const type = imageSize(bytes).type;
  const extensions = { jpg: 'jpg', png: 'png', gif: 'gif', webp: 'webp', avif: 'avif', ico: 'ico' };
  if (!extensions[type]) throw Error('Unsupported image format');
  return extensions[type];
}
export async function cacheImages(force = false) {
  await mkdir(directory, { recursive: true });
  const load = (name) =>
    readFile(new URL(`../src/data/${name}.json`, import.meta.url), 'utf8').then(JSON.parse);
  const [previews, tracks, series, previous] = await Promise.all([
    load('previews'),
    load('tracks'),
    load('series'),
    load('image-cache').catch(() => ({})),
  ]);
  const urls = [
    ...new Set(
      [
        ...Object.values(previews).flatMap((p) => [p.image, p.icon]),
        ...tracks.map((t) => t.thumbnail),
        ...series.map((s) => s.thumbnail),
      ].filter(Boolean),
    ),
  ];
  const next = {};
  let refreshed = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let source; (source = urls.shift()); ) {
        const old = previous[source];
        const exists =
          old &&
          (await access(new URL(`../public${old.file}`, import.meta.url))
            .then(() => true)
            .catch(() => false));
        if (exists) next[source] = old;
        if (!force && exists && Date.now() - Date.parse(old.checkedAt) < 7 * 86400000) continue;
        try {
          const url = new URL(source);
          if (url.protocol !== 'https:' || url.username || url.password) throw Error('Invalid source');
          const response = await fetch(url, {
            signal: AbortSignal.timeout(20000),
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; cp20.dev image collector)' },
          });
          if (!response.ok) throw Error('Image unavailable');
          const parts = [];
          let size = 0;
          for await (const part of response.body) {
            size += part.length;
            if (size > 15_000_000) throw Error('Image too large');
            parts.push(part);
          }
          const bytes = Buffer.concat(parts);
          const ext = rasterExtension(bytes);
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
            `Image cache: ${new URL(source).hostname}; ${exists ? 'kept previous file' : 'unavailable or unsupported raster'}`,
          );
        }
      }
    }),
  );
  const content = (object) =>
    Object.fromEntries(
      Object.keys(object)
        .sort()
        .map((k) => [k, object[k].file]),
    );
  const changed = JSON.stringify(content(next)) !== JSON.stringify(content(previous));
  await writeFile(
    new URL(manifestFile.href + '.tmp'),
    JSON.stringify(Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b))), null, 2) +
      '\n',
  );
  await rename(new URL(manifestFile.href + '.tmp'), manifestFile);
  const used = new Set(Object.values(next).map((p) => p.file.split('/').at(-1)));
  for (const filename of await readdir(directory))
    if (!used.has(filename)) await unlink(new URL(filename, directory));
  console.log(
    `Image cache: ${Object.keys(next).length} source URLs, ${used.size} local files, ${refreshed} refreshed`,
  );
  return changed;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await cacheImages(process.argv.includes('--force'));
