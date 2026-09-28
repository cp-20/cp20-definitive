import { readFile, writeFile, rename, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { syncMedia } from './media.mjs';
import { fetchGhostPosts } from './ghost.mjs';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

const dataPath = new URL('../src/data/generated.json', import.meta.url);
const parser = new XMLParser({ ignoreAttributes: false, processEntities: true });
import { safeUrl, article, mergeArticles } from '../src/data/normalize.mjs';
export { safeUrl, article, mergeArticles } from '../src/data/normalize.mjs';
export function parseFeed(xml, source) {
  if (XMLValidator.validate(xml) !== true || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Invalid feed');
  const data = parser.parse(xml);
  const items = data.rss?.channel?.item;
  if (!items) throw new Error('Feed contained no articles');
  return [items]
    .flat()
    .map((i) => article(typeof i.title === 'object' ? i.title['#text'] : i.title, i.link, i.pubDate, source));
}
export async function request(url, format = 'json', fetcher = fetch, extraHeaders = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const headers = {
        'User-Agent': 'cp20-definitive-content-sync',
        Accept: format === 'json' ? 'application/json' : 'application/rss+xml, application/xml',
      };
      if (new URL(url).hostname === 'api.github.com' && process.env.GITHUB_TOKEN)
        headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
      const response = await fetcher(url, {
        headers: { ...headers, ...extraHeaders },
        redirect: extraHeaders.Authorization ? 'manual' : 'follow',
        signal: AbortSignal.timeout(20000),
      });
      if (extraHeaders.Authorization && response.status >= 300 && response.status < 400)
        throw Object.assign(new Error('Admin API requires SSO authentication'), { code: 'AUTH_REDIRECT' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      let size = 0;
      const chunks = [];
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 5_000_000) throw new Error('Response exceeds 5 MB');
        chunks.push(chunk);
      }
      const text = Buffer.concat(chunks).toString('utf8');
      return format === 'json' ? JSON.parse(text) : text;
    } catch (error) {
      if (attempt === 1 || error.code === 'AUTH_REDIRECT') throw error;
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }
}
export async function paginated(load, select, map, hasNext) {
  const results = [];
  for (let page = 1; page <= 100; page++) {
    const raw = await load(page),
      rows = select(raw);
    if (!Array.isArray(rows)) throw new Error('Invalid paginated response');
    results.push(...rows.map(map));
    if (!hasNext(raw, rows)) return results;
  }
  throw new Error('Pagination exceeded 100 pages; preserving previous snapshot');
}
const providers = {
  'zenn.dev': () =>
    paginated(
      (page) => request(`https://zenn.dev/api/articles?username=cp20&count=100&page=${page}`),
      (d) => d.articles,
      (a) => article(a.title, `https://zenn.dev${a.path}`, a.published_at, 'zenn.dev'),
      (d) => Boolean(d.next_page),
    ),
  'qiita.com': () =>
    paginated(
      (page) => request(`https://qiita.com/api/v2/users/cp20/items?per_page=100&page=${page}`),
      (d) => d,
      (a) => article(a.title, a.url, a.created_at, 'qiita.com'),
      (_, rows) => rows.length === 100,
    ),
  'note.com': async () => parseFeed(await request('https://note.com/cp20/rss', 'xml'), 'note.com'),
  'trap.jp': () => fetchGhostPosts(request, article),
  'sizu.me': async () => parseFeed(await request('https://sizu.me/cp20/rss', 'xml'), 'sizu.me'),
  'github.com': () =>
    paginated(
      (page) => request(`https://api.github.com/users/cp-20/repos?per_page=100&sort=updated&page=${page}`),
      (d) => d,
      (r) => {
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
export async function collect(previous, loaders = providers, now = new Date().toISOString()) {
  const next = structuredClone(previous);
  const incoming = [];
  let successes = 0;
  let retained = previous.articles;
  const results = await Promise.allSettled(Object.values(loaders).map((load) => load()));
  Object.keys(loaders).forEach((source, index) => {
    const result = results[index];
    if (result.status === 'fulfilled' && (result.value.length || source === 'trap.jp')) {
      successes++;
      if (source === 'github.com')
        next.repos = result.value
          .filter((r) => !r.fork && !r.archived)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      else {
        // A complete Admin API snapshot is authoritative: remove unpublished or deleted posts.
        if (source === 'trap.jp') retained = retained.filter((a) => a.source !== 'trap.jp');
        incoming.push(...result.value);
      }
      next.sources[source] = { status: 'ok', lastSuccess: now, count: result.value.length };
    } else {
      next.sources[source] = {
        ...previous.sources[source],
        status: 'stale',
        reason:
          result.status === 'rejected' && result.reason?.code === 'AUTH_REDIRECT'
            ? 'sso_required'
            : 'unavailable',
      };
      console.warn(`::warning::${source}: fetch failed; keeping last successful data`);
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
  const previous = JSON.parse(await readFile(dataPath, 'utf8'));
  const next = await collect(previous);
  const mediaChanged = await syncMedia(request);

  const tmp = new URL('./generated.json.tmp', dataPath);
  await writeFile(tmp, JSON.stringify(next, null, 2) + '\n');
  await rename(tmp, dataPath);
  const { syncPreviews } = await import('./previews.mjs');
  const previewChanged = await syncPreviews(request);
  const { cacheImages } = await import('./cache-images.mjs');
  const imagesChanged = await cacheImages();
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
