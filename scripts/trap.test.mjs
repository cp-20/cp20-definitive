import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchTrapPosts, nextPage, parseAuthorPage } from './trap.mjs';
import { article, collect } from './sync.mjs';

const card = (id, title, day = '2026年7月5日') => `
<a href="/post/${id}/" class="article">
  <picture class="lozad background" data-alt="${title} feature image"></picture>
  <div class="meta"><small>${day}</small><br><strong>${title}</strong>
    <div class="author"><span>cp20</span><span class="others">他</span></div></div>
</a>`;
const page = (next, ...cards) =>
  `<html><head>${next ? `<link rel="next" href="${next}">` : ''}</head><body><section class="postlist"><div class="articles">${cards.join('')}</div></section></body></html>`;
const P2 = 'https://trap.jp/author/cp20/page/2/';
const fail = (status) => Object.assign(new Error(`HTTP ${status}`), { status });

test('author page cards become title, URL and JST day', () => {
  assert.deepEqual(parseAuthorPage(page(null, card(2949, '「A &amp; B」 ー 3班', '2026年7月5日'))), [
    { url: 'https://trap.jp/post/2949/', title: '「A & B」 ー 3班', day: '2026-07-05T00:00:00+09:00' },
  ]);
  assert.throws(
    () => parseAuthorPage('<a href="/post/1/" class="article"><strong>no date</strong></a>'),
    /markup/,
  );
});

test('pages are followed through rel="next", with RSS times when available', async () => {
  const requested = [];
  const pages = {
    'https://trap.jp/author/cp20/rss/':
      '<rss><channel><item><title>x</title><link>https://trap.jp/post/3/</link><pubDate>Sun, 05 Jul 2026 09:00:48 GMT</pubDate></item></channel></rss>',
    'https://trap.jp/author/cp20/': page(P2, card(3, 'three'), card(2, 'two')),
    [P2]: page(null, card(1, 'one', '2023年6月1日')),
  };
  const posts = await fetchTrapPosts(async (url, format) => {
    requested.push([url, format]);
    if (!(url in pages)) throw fail(404);
    return pages[url];
  }, article);
  assert.deepEqual(
    posts.map((p) => [p.url, p.date]),
    [
      ['https://trap.jp/post/3/', '2026-07-05T09:00:48.000Z'],
      ['https://trap.jp/post/2/', '2026-07-04T15:00:00.000Z'],
      ['https://trap.jp/post/1/', '2023-05-31T15:00:00.000Z'],
    ],
  );
  // The last page has no rel="next", so nothing past it is requested.
  assert.deepEqual(requested.at(-1), [P2, 'html']);
  assert.equal(
    nextPage('<head><link rel="next" href="https://trap.jp/author/cp20/page/4/"></head>'),
    'https://trap.jp/author/cp20/page/4/',
  );
  assert.equal(nextPage('<head></head><body><link rel="next" href="x"></body>'), null);
});

test('a page that fails, is empty, repeats a post or links elsewhere keeps the last snapshot', async () => {
  const crawl = (second, next = P2) =>
    fetchTrapPosts(async (url) => {
      if (url.endsWith('/rss/')) throw fail(503); // RSS is optional
      if (url === 'https://trap.jp/author/cp20/') return page(next, card(2, 'two'));
      if (url === P2) return second();
      throw fail(404);
    }, article);
  assert.equal((await crawl(async () => page(null, card(1, 'one')))).length, 2);
  await assert.rejects(
    crawl(async () => {
      throw fail(503);
    }),
    /503/,
  ); // no partial list
  await assert.rejects(
    crawl(async () => page(null)),
    /listed no posts/,
  );
  await assert.rejects(
    crawl(async () => page(null, card(2, 'two'))),
    /two pages/,
  ); // a new post shifted the list
  await assert.rejects(
    crawl(async () => page(null), 'https://evil.example/page/2/'),
    /unexpected next page/,
  );
  await assert.rejects(
    fetchTrapPosts(async (url) => (url.endsWith('/rss/') ? '<rss/>' : '<html>redesigned</html>'), article),
  );
  const previous = {
    articles: [article('kept', 'https://trap.jp/post/9/', '2025-01-01', 'trap.jp')],
    repos: [],
    sources: { 'trap.jp': { status: 'ok' } },
    updatedAt: '2025-01-01',
  };
  const failed = await collect(previous, {
    'trap.jp': () =>
      crawl(async () => {
        throw fail(500);
      }),
    'zenn.dev': async () => [article('z', 'https://zenn.dev/cp20/articles/1', '2026-01-01', 'zenn.dev')],
  });
  assert.equal(failed.sources['trap.jp'].status, 'stale');
  assert.ok(failed.articles.some((a) => a.url === 'https://trap.jp/post/9/'));
});
