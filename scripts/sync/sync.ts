// npm run sync: collects the public content (articles, repositories, the featured music and manga,
// link previews and their images) into src/data, keeping the last good data of any source that
// fails (health.ts reports a source that keeps failing).
import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import {
  article,
  mergeArticles,
  safeUrl,
  type Article,
  type Repo,
  type Snapshot,
} from '../../src/content/normalize.ts';
import { mergeWorks } from '../../src/site/pages.ts';
import { fetchTrapPosts } from './trap.ts';
import { syncPreviews } from './previews.ts';
import { syncPicks } from './picks.ts';
import { cacheImages } from './images.ts';
import { readData, repoDirs, writeData } from './files.ts';

export type Format = 'json' | 'html' | 'xml';
export type RequestOptions = {
  format?: Format;
  fetch?: typeof globalThis.fetch;
  headers?: Record<string, string>;
  /** The most bytes read; past it the request fails, or with `truncate` keeps the first ones. */
  maxBytes?: number;
  truncate?: boolean;
  /** How long to wait before the one retry. */
  retryDelay?: number;
};
export type Request = typeof request;

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

// Worth asking once more: the network failed or timed out, or the server is busy. An answer that
// will be the same next time (a 404, a page too large, malformed JSON) is not.
const retryable = (error: unknown) => {
  const status = (error as { status?: number }).status;
  if (status !== undefined) return status >= 500 || status === 429;
  return ['TypeError', 'TimeoutError', 'AbortError'].includes((error as Error).name);
};

/** GETs `url` as parsed JSON or as text, asking once more after a failure worth retrying. */
export async function request(
  url: string,
  {
    format = 'json',
    fetch = globalThis.fetch,
    headers = {},
    maxBytes = 5_000_000,
    truncate = false,
    retryDelay = 800,
  }: RequestOptions = {},
): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    try {
      const sent: Record<string, string> = {
        'User-Agent': 'cp20-definitive-content-sync',
        Accept:
          format === 'json'
            ? 'application/json'
            : format === 'html'
              ? 'text/html'
              : 'application/rss+xml, application/xml',
        ...headers,
      };
      // The token only ever goes to the API it is for.
      if (new URL(url).hostname === 'api.github.com' && process.env.GITHUB_TOKEN)
        sent.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
      const response = await fetch(url, {
        headers: sent,
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
      if (attempt === 1 || !retryable(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
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

// ── What each source answers, as the site stores it ──
export const zennArticle = (a: any) =>
  article(a?.title, `https://zenn.dev${a?.path}`, a?.published_at, 'zenn.dev');
export const qiitaArticle = (a: any) => article(a?.title, a?.url, a?.created_at, 'qiita.com');
export function githubRepo(r: any): Repo {
  if (typeof r?.name !== 'string' || !Number.isFinite(Date.parse(r.pushed_at)))
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
}
/** The repositories the site lists: the owner's own, still maintained, most recently pushed first. */
export const ownRepos = (repos: Repo[]) =>
  repos.filter((r) => !r.fork && !r.archived).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

type Loaders = Record<string, () => Promise<(Article | Repo)[]>>;
const feed = (url: string, source: string) => async () =>
  parseFeed(await request(url, { format: 'xml' }), source);
const providers: Loaders = {
  'zenn.dev': () =>
    paginated(
      (page) => request(`https://zenn.dev/api/articles?username=cp20&count=100&page=${page}`),
      (d) => d.articles,
      zennArticle,
      (d) => Boolean(d.next_page),
    ),
  'qiita.com': () =>
    paginated(
      (page) => request(`https://qiita.com/api/v2/users/cp20/items?per_page=100&page=${page}`),
      (d) => d,
      qiitaArticle,
      (_, rows) => rows.length === 100,
    ),
  'note.com': feed('https://note.com/cp20/rss', 'note.com'),
  'trap.jp': () => fetchTrapPosts((url, format) => request(url, { format })),
  'sizu.me': feed('https://sizu.me/cp20/rss', 'sizu.me'),
  'blog.cp20.dev': feed('https://blog.cp20.dev/rss.xml', 'blog.cp20.dev'),
  'github.com': () =>
    paginated(
      (page) => request(`https://api.github.com/users/cp-20/repos?per_page=100&sort=updated&page=${page}`),
      (d) => d,
      githubRepo,
      (_, rows) => rows.length === 100,
    ),
};

// ── trap.jp ──
// Its complete author-page listing replaces its previous posts, so a sudden large drop (a
// redesigned or half-loaded page) is treated as a failure unless confirmed with ALLOW_TRAP_SHRINK.
const shrank = (before: number, after: number) => before >= 4 && after * 2 < before;
/**
 * The previous articles to keep beside a complete trap.jp listing: the other sources' and the trap.jp
 * posts a work links as related (so the build's related-article check cannot jam every source).
 */
function keptBesideTrap(previous: Article[], listed: Article[], pinned: ReadonlySet<string>) {
  const returned = new Set(listed.map((a) => a.url));
  return previous.filter((a) => {
    if (a.source !== 'trap.jp') return true;
    if (!pinned.has(a.url) || returned.has(a.url)) return false;
    console.warn(`::warning::trap.jp: ${a.url} is linked by a work but was not returned; keeping it`);
    return true;
  });
}

/**
 * The next snapshot: each source that answered replaces its part, each that failed keeps its
 * last good data and is marked stale. Fails only when every source fails.
 * @param pinned trap.jp posts that works link as related, kept even when unlisted
 */
export async function collect(
  previous: Snapshot,
  loaders: Loaders = providers,
  {
    now = new Date().toISOString(),
    allowShrink = process.env.ALLOW_TRAP_SHRINK === '1',
    pinned = new Set<string>(),
  }: { now?: string; allowShrink?: boolean; pinned?: ReadonlySet<string> } = {},
) {
  const next = structuredClone(previous);
  const incoming: Article[] = [];
  let successes = 0;
  let retained = previous.articles;
  const sources = Object.keys(loaders);
  const results = await Promise.allSettled(sources.map((source) => loaders[source]()));
  const trap = sources.indexOf('trap.jp');
  const trapBefore = previous.articles.filter((a) => a.source === 'trap.jp').length;
  const listed = results[trap];
  if (listed?.status === 'fulfilled' && !allowShrink && shrank(trapBefore, listed.value.length)) {
    console.warn(
      `::warning::trap.jp: ${listed.value.length} of ${trapBefore} posts returned; set ALLOW_TRAP_SHRINK=1 to accept`,
    );
    results[trap] = { status: 'rejected', reason: Error('Unconfirmed trap.jp shrink') };
  }
  sources.forEach((source, index) => {
    const result = results[index];
    if (result.status === 'fulfilled' && (result.value.length || source === 'trap.jp')) {
      successes++;
      if (source === 'github.com') next.repos = ownRepos(result.value as Repo[]);
      else {
        const posts = result.value as Article[];
        if (source === 'trap.jp') retained = keptBesideTrap(retained, posts, pinned);
        incoming.push(...posts);
      }
      next.sources[source] = { status: 'ok', lastSuccess: now, count: result.value.length };
    } else {
      next.sources[source] = { ...previous.sources[source], status: 'stale', reason: 'unavailable' };
      const why = result.status === 'rejected' ? result.reason?.message : 'no items returned';
      console.warn(`::warning::${source}: fetch failed (${why}); keeping last successful data`);
    }
  });
  if (!successes) throw new Error('All sources failed; snapshot was not changed');
  next.articles = mergeArticles([...retained, ...incoming]);
  // Checks don't change the public content timestamp; only actual data changes do.
  if (!isDeepStrictEqual([next.articles, next.repos], [previous.articles, previous.repos]))
    next.updatedAt = now;
  next.checkedAt = now;
  return next;
}

async function main() {
  const [previous, works, manual] = await Promise.all(
    ['generated', 'works', 'manual'].map((name) => readData(repoDirs, name)),
  );
  const pinned = new Set<string>(
    mergeWorks<{ id: string; relatedArticles?: string[] }>(works, manual).flatMap(
      (w) => w.relatedArticles ?? [],
    ),
  );
  const next: Snapshot = await collect(previous, providers, { pinned });
  const picksChanged = await syncPicks(request);
  await writeData(repoDirs, 'generated', next);
  const previousPreviews = await readData(repoDirs, 'previews').catch(() => ({}));
  const previewChanged = await syncPreviews(request);
  // A new OG image that cannot be cached falls back to the page's previous image and file.
  const imagesChanged = await cacheImages({ previousPreviews });
  const changed =
    imagesChanged ||
    previewChanged ||
    picksChanged ||
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
