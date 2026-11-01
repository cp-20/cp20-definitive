import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchTrapPosts, parseAuthorPage } from './trap.mjs';
import { article, collect } from './sync.mjs';

const card = (id, title, day = '2026年7月5日') => `
<a href="/post/${id}/" class="article">
  <picture class="lozad background" data-alt="${title} feature image"></picture>
  <div class="meta"><small>${day}</small><br><strong>${title}</strong>
    <div class="author"><span>cp20</span><span class="others">他</span></div></div>
</a>`;
const page = (...cards) =>
  `<html><body><section class="postlist"><div class="articles">${cards.join('')}</div></section></body></html>`;
const notFound = () => Object.assign(new Error('HTTP 404'), { status: 404 });

test('author page cards become title, URL and JST day', () => {
  assert.deepEqual(parseAuthorPage(page(card(2949, '「A &amp; B」 ー 3班', '2026年7月5日'))), [
    { url: 'https://trap.jp/post/2949/', title: '「A & B」 ー 3班', day: '2026-07-05T00:00:00+09:00' },
  ]);
  assert.throws(
    () => parseAuthorPage('<a href="/post/1/" class="article"><strong>no date</strong></a>'),
    /markup/,
  );
});

test('every author page is read until the 404, with RSS times when available', async () => {
  const requested = [];
  const pages = {
    'https://trap.jp/author/cp20/rss/':
      '<rss><channel><item><title>x</title><link>https://trap.jp/post/3/</link><pubDate>Sun, 05 Jul 2026 09:00:48 GMT</pubDate></item></channel></rss>',
    'https://trap.jp/author/cp20/': page(card(3, 'three'), card(2, 'two')),
    'https://trap.jp/author/cp20/page/2/': page(card(1, 'one', '2023年6月1日')),
  };
  const posts = await fetchTrapPosts(async (url, format) => {
    requested.push([url, format]);
    if (!(url in pages)) throw notFound();
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
  assert.deepEqual(requested.at(-1), ['https://trap.jp/author/cp20/page/3/', 'html']);
});

test('a missing RSS only costs exact times; a broken first page keeps the last snapshot', async () => {
  const posts = await fetchTrapPosts(async (url) => {
    if (url.endsWith('/rss/')) throw new Error('HTTP 503');
    if (url === 'https://trap.jp/author/cp20/') return page(card(1, 'one'));
    throw notFound();
  }, article);
  assert.equal(posts.length, 1);
  for (const first of [
    async () => page(),
    async () => {
      throw notFound();
    },
    async () => '<html>redesigned</html>',
  ])
    await assert.rejects(
      fetchTrapPosts(async (url) => (url.endsWith('/rss/') ? '<rss/>' : first()), article),
    );
  const previous = {
    articles: [article('kept', 'https://trap.jp/post/9/', '2025-01-01', 'trap.jp')],
    repos: [],
    sources: { 'trap.jp': { status: 'ok' } },
    updatedAt: '2025-01-01',
  };
  const failed = await collect(previous, {
    'trap.jp': () => fetchTrapPosts(async () => page(), article),
    'zenn.dev': async () => [article('z', 'https://zenn.dev/cp20/articles/1', '2026-01-01', 'zenn.dev')],
  });
  assert.equal(failed.sources['trap.jp'].status, 'stale');
  assert.ok(failed.articles.some((a) => a.url === 'https://trap.jp/post/9/'));
});
