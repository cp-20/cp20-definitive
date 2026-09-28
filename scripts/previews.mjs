import { readFile, writeFile, rename } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { imageSize } from 'image-size';
import { mergeArticles } from '../src/data/normalize.mjs';
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
export function parsePreview(html, url) {
  const metas = {},
    links = [];
  for (const tag of html.match(/<(?:meta|link)\s[^>]*>/gi) || []) {
    const a = Object.fromEntries(
      [...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map((m) => [
        m[1].toLowerCase(),
        m[2] ?? m[3] ?? m[4],
      ]),
    );
    if (a.content) metas[(a.property || a.name || '').toLowerCase()] ??= a.content;
    if (a.rel && a.href) links.push(a);
  }
  const image = https(metas['og:image:secure_url'] || metas['og:image'] || metas['twitter:image'] || '', url);
  const icon =
    links.find((l) => l.rel === 'apple-touch-icon') || links.find((l) => l.rel.split(' ').includes('icon'));
  return {
    image,
    icon: icon ? https(icon.href, url) : null,
    width: +metas['og:image:width'] || 1200,
    height: +metas['og:image:height'] || 630,
  };
}
async function dimensions(url) {
  const r = await fetch(url, {
    signal: AbortSignal.timeout(12000),
    headers: { 'User-Agent': 'cp20.dev link preview collector' },
  });
  if (!r.ok) throw Error();
  let size = 0;
  const chunks = [];
  const reader = r.body.getReader();
  try {
    while (size < 2_000_000) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
  } finally {
    await reader.cancel();
  }
  const result = imageSize(Buffer.concat(chunks));
  return { width: result.width, height: result.height };
}
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
  const next = { ...previous };
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
          const html = await request(url, 'html', fetch, {
            Accept: 'text/html',
            'User-Agent': 'Mozilla/5.0 (compatible; cp20.dev link preview collector)',
          });
          const preview = parsePreview(html, url);
          if (preview.image) {
            try {
              Object.assign(preview, await dimensions(preview.image));
            } catch {
              if (!previous[url]?.image) preview.image = null;
              else preview.image = previous[url].image;
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
          next[url] = {
            ...preview,
            image: preview.image || previous[url]?.image || null,
            checkedAt: new Date().toISOString(),
          };
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
