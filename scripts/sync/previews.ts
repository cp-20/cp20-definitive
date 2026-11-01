// What the pages show of the pages they link: each work's and article's OG image and site icon
// (previews.json), and the featured music and manga with the manga publishers' thumbnails
// (tracks.json, series.json). Only the head of each third-party page is read.
import { readFile, writeFile, rename } from 'node:fs/promises';
import { parse } from 'node-html-parser';
import { mergeArticles } from '../../src/content/normalize.ts';
import { dimensions, size } from './images.ts';
import type { Request } from './sync.ts';

const data = (name: string) => new URL(`../../src/data/${name}.json`, import.meta.url);
const load = (name: string) => readFile(data(name), 'utf8').then(JSON.parse);
async function saveIfChanged(file: URL, previous: unknown, next: unknown) {
  if (JSON.stringify(previous) === JSON.stringify(next)) return false;
  const tmp = new URL(file.href + '.tmp');
  await writeFile(tmp, JSON.stringify(next, null, 2) + '\n');
  await rename(tmp, file);
  return true;
}
// Only the head is parsed, so a large page is truncated instead of downloaded in full.
const htmlLimit = { maxBytes: 1_000_000, truncate: true };

// The <meta> and <link> elements of a page's head. Only the head is parsed (and at most maxScan
// characters of it), so a hostile page cannot make the parse run over its whole body.
const maxScan = 512_000;
const headElements = (html: string, selector: string) => {
  const end = html.search(/<\/head\s*>/i);
  return parse(html.slice(0, Math.min(end < 0 ? html.length : end, maxScan))).querySelectorAll(selector);
};

// ── Link previews ──
const https = (s: string, base: string) => {
  if (!s.trim()) return null;
  try {
    const u = new URL(s, base);
    return u.protocol === 'https:' && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
};
type Preview = {
  image: string | null;
  icon: string | null;
  width: number;
  height: number;
  checkedAt?: string;
};
export function parsePreview(html: string, url: string): Preview {
  const metas: Record<string, string> = {},
    links: { rel: string; href: string }[] = [];
  for (const element of headElements(html, 'meta, link')) {
    const a = (name: string) => element.getAttribute(name) ?? '';
    if (a('content')) metas[(a('property') || a('name')).toLowerCase()] ??= a('content');
    if (a('rel') && a('href')) links.push({ rel: a('rel'), href: a('href') });
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
// Only pages the site still links to keep metadata, so a replaced URL's image is not cached forever.
export const keepReferenced = <T>(previews: Record<string, T>, urls: string[]) => {
  const linked = new Set(urls);
  return Object.fromEntries(Object.entries(previews).filter(([url]) => linked.has(url)));
};
export async function syncPreviews(request: Request, force = false) {
  const file = data('previews');
  const [previous, works, manual, snapshot] = await Promise.all([
    load('previews').catch(() => ({})) as Promise<Record<string, Preview>>,
    load('works'),
    load('manual'),
    load('generated'),
  ]);
  const urls: string[] = [
    ...new Set(
      [...works, ...manual.projects, ...mergeArticles(snapshot.articles, [], manual)].map(
        (x: { url: string }) => x.url,
      ),
    ),
  ];
  const next = keepReferenced(previous, urls);
  let fetched = 0;
  // Refresh successes weekly; retry missing/failed entries on the next scheduled run.
  const queue = urls.filter(
    (url) =>
      force || !previous[url]?.image || Date.now() - Date.parse(previous[url].checkedAt!) > 7 * 86400000,
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
            htmlLimit,
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
  const content = (o: Record<string, Preview>) =>
    Object.fromEntries(Object.entries(o).map(([url, { checkedAt, ...p }]) => [url, p]));
  const changed = JSON.stringify(content(previous)) !== JSON.stringify(content(next));
  await writeFile(new URL(file.href + '.tmp'), JSON.stringify(next, null, 2) + '\n');
  await rename(new URL(file.href + '.tmp'), file);
  console.log(
    `OG previews: ${Object.values(next).filter((p) => p.image).length}/${urls.length}; fetched ${fetched}`,
  );
  return changed;
}

// ── Featured music and manga ──
const allowedImages = new Set([
  'cdn-img.comic-action.com',
  'public.ynjn.jp',
  'eh96lnrmau.user-space.cdn.idcfcloud.net',
  'deliver.cdn.nicomanga.jp',
  'cdn.comic-walker.com',
]);
const publishers: Record<string, string> = {
  'comic-action.com': '双葉社 / webアクション',
  'ynjn.jp': '集英社 / ヤンジャン！',
  'yanmaga.jp': '講談社 / ヤンマガWeb',
  'manga.nicovideo.jp': 'ニコニコ漫画',
  'comic-walker.com': 'KADOKAWA / カドコミ',
};
/** The publisher thumbnail of a manga page: its og:image, if it is served from a known publisher CDN. */
export function ogImage(html: string) {
  for (const meta of headElements(html, 'meta[property="og:image"][content]')) {
    const u = new URL(meta.getAttribute('content')!);
    if (u.protocol === 'https:' && allowedImages.has(u.hostname)) return u.href;
  }
  throw Error('No supported publisher thumbnail');
}
type Track = { title: string; composer: string; link: string; thumbnail: string };
type Series = { title: string; author: string; link: string; thumbnail: string; credit: string };
export async function syncMedia(request: Request) {
  const trackPath = data('tracks'),
    seriesPath = data('series');
  const [tracks, series]: [Track[], Series[]] = await Promise.all([load('tracks'), load('series')]);
  let nextTracks = tracks,
    nextSeries = structuredClone(series);
  try {
    const raw = await request('https://2026.cp20.dev/featured-tracks?raw=true');
    if (!Array.isArray(raw) || !raw.length) throw Error();
    nextTracks = raw.map((t) => {
      const u = new URL(t.link);
      const id = u.pathname.slice(1);
      if (
        u.protocol !== 'https:' ||
        u.hostname !== 'youtu.be' ||
        !/^[-_a-zA-Z0-9]{11}$/.test(id) ||
        typeof t.title !== 'string' ||
        typeof t.composer !== 'string'
      )
        throw Error();
      return {
        title: t.title,
        composer: t.composer,
        // Rebuilt from the checked ID so no scheme, query or hash from the source reaches the href.
        link: `https://youtu.be/${id}`,
        thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      };
    });
  } catch {
    console.warn('::warning::Music source unavailable; keeping previous selection');
  }
  try {
    const raw = await request('https://2026.cp20.dev/featured-series?raw=true');
    if (!Array.isArray(raw) || !raw.length) throw Error();
    nextSeries = raw.map((s) => {
      const u = new URL(s.link);
      if (
        u.protocol !== 'https:' ||
        !publishers[u.hostname] ||
        typeof s.title !== 'string' ||
        typeof s.author !== 'string'
      )
        throw Error();
      const old = series.find((p) => p.link === s.link);
      return {
        title: s.title,
        author: s.author,
        link: s.link,
        thumbnail: old?.thumbnail || '',
        credit: publishers[u.hostname],
      };
    });
  } catch {
    console.warn('::warning::Manga selection unavailable; keeping previous selection');
  }
  const results = await Promise.allSettled(
    nextSeries.map(async (s) => ({
      ...s,
      thumbnail: ogImage(await request(s.link, 'html', fetch, {}, htmlLimit)),
    })),
  );
  nextSeries = results.map((r, i) => (r.status === 'fulfilled' ? r.value : nextSeries[i]));
  // An inaccessible new entry must not replace the previously working shelf.
  if (nextSeries.some((s) => !s.thumbnail)) nextSeries = series;
  const a = await saveIfChanged(trackPath, tracks, nextTracks);
  const b = await saveIfChanged(seriesPath, series, nextSeries);
  return a || b;
}
