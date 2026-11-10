// What the pages show of the pages they link: each work's and article's OG image and site icon
// (previews.json). Only the head of each third-party page is read.
import { imageSize } from 'image-size';
import { mergeArticles } from '../../src/content/normalize.ts';
import { isLocal, type Preview } from '../../src/content/media.ts';
import { downloadRaster } from './images.ts';
import { headElements, headRequest } from './head.ts';
import { REFRESH_MS, eachLimited, readData, repoDirs, writeData, type Dirs } from './files.ts';
import type { Request } from './sync.ts';

const https = (s: string, base: string) => {
  if (!s.trim()) return null;
  try {
    const u = new URL(s, base);
    return u.protocol === 'https:' && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
};
// Metadata sizes come from third-party pages: only plausible positive integers are kept.
const size = (value: unknown, fallback: number) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 10000 ? n : fallback;
};
/**
 * The size of a new OG image, read from the image itself. It is accepted only when the cache would
 * also accept it (images.ts); otherwise the page keeps its previous image and its cached file.
 */
export async function dimensions(url: string, fetcher: typeof fetch = fetch) {
  const { width, height } = imageSize((await downloadRaster(url, fetcher)).bytes);
  return { width: size(width, 1200), height: size(height, 630) };
}
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
type Stated = { image?: string; icon?: string | null };
/**
 * A work's eyecatch and icon stated in works.json (`image`, `icon`) win over its page's: for a
 * page whose own are missing or not the work's (a repository page offers GitHub's). `"icon": null`
 * states that the work has none.
 */
export const withStated = (preview: Preview, work?: Stated): Preview => ({
  ...preview,
  ...(work?.image && { image: work.image }),
  ...(work && 'icon' in work && { icon: work.icon ?? null }),
});
/**
 * Whether an icon URL serves an image. Some hosts answer HEAD with an error while serving the file
 * to GET, so a failed HEAD is retried as a GET (whose body is not read).
 */
export async function reachable(url: string, fetcher: typeof fetch = fetch) {
  const ask = async (method: 'HEAD' | 'GET') => {
    try {
      const r = await fetcher(url, { method, signal: AbortSignal.timeout(8000) });
      await r.body?.cancel();
      return r.ok;
    } catch {
      return false;
    }
  };
  return (await ask('HEAD')) || ask('GET');
}
// Only pages the site still links to keep metadata, so a replaced URL's image is not cached forever.
export const keepReferenced = <T>(previews: Record<string, T>, urls: string[]) => {
  const linked = new Set(urls);
  return Object.fromEntries(Object.entries(previews).filter(([url]) => linked.has(url)));
};

/**
 * Refreshes previews.json for every page the site links (weekly, sooner for one without an image
 * or with a newly stated one). A page that cannot be read keeps its previous preview.
 * @returns whether anything but the check times changed
 */
export async function syncPreviews(
  request: Request,
  {
    force = false,
    dirs = repoDirs,
    fetch = globalThis.fetch,
  }: { force?: boolean; dirs?: Dirs; fetch?: typeof globalThis.fetch } = {},
) {
  const [previous, works, manual, snapshot]: [
    Record<string, Preview>,
    ({ url: string } & Stated)[],
    any,
    any,
  ] = await Promise.all([
    readData(dirs, 'previews').catch(() => ({})),
    readData(dirs, 'works'),
    readData(dirs, 'manual'),
    readData(dirs, 'generated'),
  ]);
  const urls: string[] = [
    ...new Set(
      [...works, ...manual.projects, ...mergeArticles(snapshot.articles, manual)].map(
        (x: { url: string }) => x.url,
      ),
    ),
  ];
  const stated = new Map<string, Stated>(works.map((w) => [w.url, w]));
  const next = keepReferenced(previous, urls);
  let fetched = 0;
  // A newly stated image or icon is picked up on the next run.
  const restated = (url: string) => {
    const p = previous[url];
    return !!p && JSON.stringify(withStated(p, stated.get(url))) !== JSON.stringify(p);
  };
  // Refresh successes weekly; retry missing/failed entries on the next scheduled run.
  const queue = urls.filter(
    (url) =>
      force ||
      !previous[url]?.image ||
      restated(url) ||
      Date.now() - Date.parse(previous[url].checkedAt!) > REFRESH_MS,
  );
  await eachLimited(queue, 6, async (url) => {
    try {
      const html = await request(url, {
        ...headRequest,
        fetch,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; cp20.dev link preview collector)' },
      });
      const preview = withStated(parsePreview(html, url), stated.get(url));
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
          Object.assign(preview, await dimensions(preview.image, fetch));
        } catch {
          keepOldImage();
        }
      }
      if (preview.icon && !isLocal(preview.icon) && !(await reachable(preview.icon, fetch)))
        preview.icon = old?.icon || null;
      next[url] = { ...preview, checkedAt: new Date().toISOString() };
      fetched++;
    } catch {
      // A page behind a login (a club's members-only service) cannot be read, but the image and
      // icon works.json states for it can still be shown.
      const image = stated.get(url)?.image;
      if (image && previous[url]?.image !== image) {
        try {
          next[url] = {
            ...withStated({ image: null, icon: null, width: 1200, height: 630 }, stated.get(url)),
            ...(await dimensions(image, fetch)),
            checkedAt: new Date().toISOString(),
          };
          fetched++;
          return;
        } catch {}
      }
      if (previous[url] && restated(url)) {
        next[url] = { ...withStated(previous[url], stated.get(url)), checkedAt: new Date().toISOString() };
        fetched++;
        return;
      }
      console.warn(`Preview unavailable: ${new URL(url).hostname}; retaining previous metadata`);
    }
  });
  const content = (o: Record<string, Preview>) =>
    Object.fromEntries(Object.entries(o).map(([url, { checkedAt: _, ...p }]) => [url, p]));
  const changed = JSON.stringify(content(previous)) !== JSON.stringify(content(next));
  await writeData(dirs, 'previews', next);
  console.log(
    `OG previews: ${Object.values(next).filter((p) => p.image).length}/${urls.length}; fetched ${fetched}`,
  );
  return changed;
}
