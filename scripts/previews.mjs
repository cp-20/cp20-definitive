import { readFile, writeFile, rename } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { imageSize } from 'image-size';
import { headTags } from './html-tags.mjs';
import { decodableRaster, maxImageBytes } from './cache-images.mjs';
import { mergeArticles } from '../src/content/normalize.ts';
const file = new URL('../src/data/previews.json', import.meta.url);
const decode = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));
const https = (s, base) => {
  if (!s.trim()) return null;
  try {
    const u = new URL(decode(s), base);
    return u.protocol === 'https:' && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
};
// Metadata sizes come from third-party pages: only plausible positive integers are kept.
const size = (value, fallback) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 10000 ? n : fallback;
};
export function parsePreview(html, url) {
  const metas = {},
    links = [];
  for (const a of headTags(html, ['meta', 'link'])) {
    if (a.content) metas[(a.property || a.name || '').toLowerCase()] ??= a.content;
    if (a.rel && a.href) links.push(a);
  }
  const image = https(metas['og:image:secure_url'] || metas['og:image'] || metas['twitter:image'] || '', url);
  const icon =
    links.find((l) => l.rel === 'apple-touch-icon') || links.find((l) => l.rel.split(' ').includes('icon'));
  return {
    image,
    icon: icon ? https(icon.href, url) : null,
    width: size(metas['og:image:width'], 1200),
    height: size(metas['og:image:height'], 630),
  };
}
// Accept a new OG image only when cache-images would also accept it (raster, at most 15 MB);
// otherwise the page keeps its previous image and the previously cached file.
export async function dimensions(url, fetcher = fetch) {
  const r = await fetcher(url, {
    signal: AbortSignal.timeout(20000),
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; cp20.dev image collector)' },
  });
  if (!r.ok) throw Error('Image unavailable');
  let total = 0;
  const chunks = [];
  for await (const chunk of r.body) {
    total += chunk.length;
    if (total > maxImageBytes) throw Error('Image too large');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  await decodableRaster(bytes);
  const result = imageSize(bytes);
  return { width: size(result.width, 1200), height: size(result.height, 630) };
}
// Only pages the site still links to keep metadata, so a replaced URL's image is not cached forever.
export const keepReferenced = (previews, urls) => {
  const linked = new Set(urls);
  return Object.fromEntries(Object.entries(previews).filter(([url]) => linked.has(url)));
};
export async function syncPreviews(request, force = false) {
  const [previous, works, manual, snapshot] = await Promise.all([
    readFile(file, 'utf8')
      .then(JSON.parse)
      .catch(() => ({})),
    ...['works', 'manual', 'generated'].map((name) =>
      readFile(new URL(`../src/data/${name}.json`, import.meta.url), 'utf8').then(JSON.parse),
    ),
  ]);
  const urls = [
    ...new Set(
      [...works, ...manual.projects, ...mergeArticles(snapshot.articles, [], manual)].map((x) => x.url),
    ),
  ];
  const next = keepReferenced(previous, urls);
  let fetched = 0;
  // Refresh successes weekly; retry missing/failed entries on the next scheduled run.
  const queue = urls.filter(
    (url) =>
      force || !previous[url]?.image || Date.now() - Date.parse(previous[url].checkedAt) > 7 * 86400000,
  );
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let url; (url = queue.shift()); ) {
        try {
          const html = await request(
            url,
            'html',
            fetch,
            {
              Accept: 'text/html',
              'User-Agent': 'Mozilla/5.0 (compatible; cp20.dev link preview collector)',
            },
            { maxBytes: 1_000_000, truncate: true },
          );
          const preview = parsePreview(html, url);
          const old = previous[url];
          const keepOldImage = () => {
            // Image, width and height travel together so a stale image never gets new dimensions.
            preview.image = old?.image || null;
            preview.width = (old?.image && old.width) || 1200;
            preview.height = (old?.image && old.height) || 630;
          };
          if (!preview.image) keepOldImage();
          else {
            try {
              Object.assign(preview, await dimensions(preview.image));
            } catch {
              keepOldImage();
            }
          }
          if (preview.icon) {
            try {
              const r = await fetch(preview.icon, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
              if (!r.ok) preview.icon = previous[url]?.icon || null;
            } catch {
              preview.icon = previous[url]?.icon || null;
            }
          }
          next[url] = { ...preview, checkedAt: new Date().toISOString() };
          fetched++;
        } catch {
          console.warn(`Preview unavailable: ${new URL(url).hostname}; retaining previous metadata`);
        }
      }
    }),
  );
  const content = (o) => Object.fromEntries(Object.entries(o).map(([url, { checkedAt, ...p }]) => [url, p]));
  const changed = JSON.stringify(content(previous)) !== JSON.stringify(content(next));
  await writeFile(new URL(file.href + '.tmp'), JSON.stringify(next, null, 2) + '\n');
  await rename(new URL(file.href + '.tmp'), file);
  console.log(
    `OG previews: ${Object.values(next).filter((p) => p.image).length}/${urls.length}; fetched ${fetched}`,
  );
  return changed;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { request } = await import('./sync.mjs');
  await syncPreviews(request, process.argv.includes('--force'));
}
