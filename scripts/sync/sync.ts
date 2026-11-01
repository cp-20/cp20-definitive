// npm run sync: collects the public content (articles, repositories, the featured music and manga,
// link previews and their images) into src/data, keeping the last good data of any source that
// fails (health.ts reports a source that keeps failing).
import { readFile, writeFile, rename, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { article, mergeArticles, safeUrl, type Article } from '../../src/content/normalize.ts';
import { mergeWorks } from '../../src/site/pages.ts';
import { fetchTrapPosts } from './trap.ts';
import { syncMedia, syncPreviews } from './previews.ts';
import { cacheImages } from './images.ts';

type Repo = {
  name: string;
  url: string;
  description: string;
  language: string;
  stars: number;
  updatedAt: string;
  fork: boolean;
  archived: boolean;
};
export type Source = { status: string; lastSuccess?: string; count?: number; reason?: string };
export type Snapshot = {
  articles: Article[];
  repos: Repo[];
  sources: Record<string, Source>;
  updatedAt: string;
  checkedAt?: string;
};
export type Format = 'json' | 'html' | 'xml';
export type Request = typeof request;

const dataPath = new URL('../../src/data/generated.json', import.meta.url);
// Tag values stay strings ('2024', '1e3', 'true' are valid titles); numeric/hex references are decoded.
const parser = new XMLParser({
  ignoreAttributes: false,
  processEntities: true,
  htmlEntities: true,
  parseTagValue: false,
});
export function parseFeed(xml: string, source: string) {
  if (XMLValidator.validate(xml) !== true || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Invalid feed');
  const data = parser.parse(xml);
  const items = data.rss?.channel?.item;
  if (!items) throw new Error('Feed contained no articles');
  const rows: Article[] = [];
  for (const i of [items].flat()) {
    try {
      rows.push(
        article(typeof i?.title === 'object' ? i.title['#text'] : i?.title, i?.link, i?.pubDate, source),
      );
    } catch {
      // One malformed item must not hide the rest of the feed.
      console.warn(`::warning::${source}: skipped an invalid feed item`);
    }
  }
  if (!rows.length) throw new Error('Feed contained no valid articles');
  return rows;
}
/**
 * GETs `url` (retrying once), as parsed JSON or as text.
 * @param options truncate keeps the first maxBytes instead of failing.
 */
export async function request(
  url: string,
  format: Format = 'json',
  fetcher: typeof fetch = fetch,
  extraHeaders: Record<string, string> = {},
  { maxBytes = 5_000_000, truncate = false } = {},
): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    try {
      const headers: Record<string, string> = {
        'User-Agent': 'cp20-definitive-content-sync',
        Accept:
          format === 'json'
            ? 'application/json'
            : format === 'html'
              ? 'text/html'
              : 'application/rss+xml, application/xml',
      };
      if (new URL(url).hostname === 'api.github.com' && process.env.GITHUB_TOKEN)
        headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
      const response = await fetcher(url, {
        headers: { ...headers, ...extraHeaders },
        redirect: 'follow',
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok)
        throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
      let size = 0;
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.body!) {
        if (size + chunk.length > maxBytes) {
          if (!truncate) throw new Error(`Response exceeds ${maxBytes} bytes`);
          chunks.push(chunk.subarray(0, maxBytes - size));
          break;
        }
        size += chunk.length;
        chunks.push(chunk);
      }
      const text = Buffer.concat(chunks).toString('utf8');
      return format === 'json' ? JSON.parse(text) : text;
    } catch (error) {
      if (attempt === 1 || (error as { status?: number }).status === 404) throw error;
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }
}
export async function paginated<Raw, Row, T>(
  load: (page: number) => Promise<Raw>,
  select: (raw: Raw) => Row[],
  map: (row: Row) => T,
  hasNext: (raw: Raw, rows: Row[]) => boolean,
) {
  const results: T[] = [];
  for (let page = 1; page <= 100; page++) {
    const raw = await load(page),
      rows = select(raw);
    if (!Array.isArray(rows)) throw new Error('Invalid paginated response');
    results.push(...rows.map(map));
    if (!hasNext(raw, rows)) return results;
  }
  throw new Error('Pagination exceeded 100 pages; preserving previous snapshot');
}
type Loaders = Record<string, () => Promise<(Article | Repo)[]>>;
const providers: Loaders = {
  'zenn.dev': () =>
    paginated(
      (page) => request(`https://zenn.dev/api/articles?username=cp20&count=100&page=${page}`),
      (d) => d.articles,
      (a: any) => article(a.title, `https://zenn.dev${a.path}`, a.published_at, 'zenn.dev'),
      (d) => Boolean(d.next_page),
    ),
  'qiita.com': () =>
    paginated(
      (page) => request(`https://qiita.com/api/v2/users/cp20/items?per_page=100&page=${page}`),
      (d) => d,
      (a: any) => article(a.title, a.url, a.created_at, 'qiita.com'),
      (_, rows) => rows.length === 100,
    ),
  'note.com': async () => parseFeed(await request('https://note.com/cp20/rss', 'xml'), 'note.com'),
  'trap.jp': () => fetchTrapPosts(request, article),
  'sizu.me': async () => parseFeed(await request('https://sizu.me/cp20/rss', 'xml'), 'sizu.me'),
  'blog.cp20.dev': async () =>
    parseFeed(await request('https://blog.cp20.dev/rss.xml', 'xml'), 'blog.cp20.dev'),
  'github.com': () =>
    paginated(
      (page) => request(`https://api.github.com/users/cp-20/repos?per_page=100&sort=updated&page=${page}`),
      (d) => d,
      (r: any): Repo => {
        if (typeof r.name !== 'string' || !Number.isFinite(Date.parse(r.pushed_at)))
          throw new Error('Invalid repository');
        return {
          name: r.name,
          url: safeUrl(r.html_url),
          description: r.description || '',
          language: r.language || '',
          stars: Number(r.stargazers_count) || 0,
          updatedAt: r.pushed_at,
          fork: Boolean(r.fork),
          archived: Boolean(r.archived),
        };
      },
      (_, rows) => rows.length === 100,
    ),
};
export async function collect(
  previous: Snapshot,
  loaders: Loaders = providers,
  now = new Date().toISOString(),
  allowShrink = process.env.ALLOW_TRAP_SHRINK === '1',
  pinned = new Set<string>(),
) {
  const next = structuredClone(previous);
  const incoming: Article[] = [];
  let successes = 0;
  let retained = previous.articles;
  const results = await Promise.allSettled(Object.values(loaders).map((load) => load()));
  // trap.jp replaces its previous articles, so a sudden large drop is treated as a failure unless confirmed.
  const trapIndex = Object.keys(loaders).indexOf('trap.jp');
  const trap = results[trapIndex];
  const trapBefore = previous.articles.filter((a) => a.source === 'trap.jp').length;
  if (
    trap &&
    !allowShrink &&
    trap.status === 'fulfilled' &&
    trapBefore >= 4 &&
    trap.value.length * 2 < trapBefore
  ) {
    console.warn(
      `::warning::trap.jp: ${trap.value.length} of ${trapBefore} posts returned; set ALLOW_TRAP_SHRINK=1 to accept`,
    );
    results[trapIndex] = { status: 'rejected', reason: Error('Unconfirmed trap.jp shrink') };
  }
  Object.keys(loaders).forEach((source, index) => {
    const result = results[index];
    if (result.status === 'fulfilled' && (result.value.length || source === 'trap.jp')) {
      successes++;
      if (source === 'github.com')
        next.repos = (result.value as Repo[])
          .filter((r) => !r.fork && !r.archived)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      else {
        const posts = result.value as Article[];
        // A complete author-page listing is authoritative: remove unpublished or deleted posts.
        // Posts a work links as related are kept, so the build's related-article check cannot jam every source.
        if (source === 'trap.jp') {
          const returned = new Set(posts.map((a) => a.url));
          retained = retained.filter((a) => {
            if (a.source !== 'trap.jp') return true;
            if (!pinned.has(a.url) || returned.has(a.url)) return false;
            console.warn(`::warning::trap.jp: ${a.url} is linked by a work but was not returned; keeping it`);
            return true;
          });
        }
        incoming.push(...posts);
      }
      next.sources[source] = { status: 'ok', lastSuccess: now, count: result.value.length };
    } else {
      next.sources[source] = {
        ...previous.sources[source],
        status: 'stale',
        reason: 'unavailable',
      };
      const why = result.status === 'rejected' ? result.reason?.message : 'no items returned';
      console.warn(`::warning::${source}: fetch failed (${why}); keeping last successful data`);
    }
  });
  if (!successes) throw new Error('All sources failed; snapshot was not changed');
  next.articles = mergeArticles(retained, incoming);
  // Checks don't change the public content timestamp; only actual data changes do.
  if (!isDeepStrictEqual([next.articles, next.repos], [previous.articles, previous.repos]))
    next.updatedAt = now;
  next.checkedAt = now;
  return next;
}

async function main() {
  const previous: Snapshot = JSON.parse(await readFile(dataPath, 'utf8'));
  const load = async (name: string) =>
    JSON.parse(await readFile(new URL(`./${name}.json`, dataPath), 'utf8'));
  const [works, manual] = await Promise.all([load('works'), load('manual')]);
  const pinned = new Set<string>(
    mergeWorks<{ id: string; relatedArticles?: string[] }>(works, manual).flatMap(
      (w) => w.relatedArticles ?? [],
    ),
  );
  const next = await collect(previous, providers, undefined, undefined, pinned);
  const mediaChanged = await syncMedia(request);

  const tmp = new URL('./generated.json.tmp', dataPath);
  await writeFile(tmp, JSON.stringify(next, null, 2) + '\n');
  await rename(tmp, dataPath);
  const previewsPath = new URL('./previews.json', dataPath);
  const previousPreviews = JSON.parse(await readFile(previewsPath, 'utf8').catch(() => '{}'));
  const previewChanged = await syncPreviews(request);
  // A new OG image that cannot be cached falls back to the page's previous image and file.
  const imagesChanged = await cacheImages(false, previousPreviews);
  const changed =
    imagesChanged ||
    previewChanged ||
    mediaChanged ||
    next.updatedAt !== previous.updatedAt ||
    Object.keys(next.sources).some(
      (k) =>
        next.sources[k].status !== previous.sources[k]?.status ||
        next.sources[k].reason !== previous.sources[k]?.reason,
    );
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
  console.log(
    `Collected ${next.articles.length} articles and ${next.repos.length} repositories. Content changed: ${changed}`,
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
