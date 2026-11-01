import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { article } from '../../src/content/normalize.ts';
import { collect } from './sync.ts';
import { fetchTrapPosts, nextPage, parseAuthorPage } from './trap.ts';

const card = (id: number, title: string, day = '2026年7月5日') => `
<a href="/post/${id}/" class="article">
  <picture class="lozad background" data-alt="${title} feature image"></picture>
  <div class="meta"><small>${day}</small><br><strong>${title}</strong>
    <div class="author"><span>cp20</span><span class="others">他</span></div></div>
</a>`;
const page = (next: string | null, ...cards: string[]) =>
  `<html><head>${next ? `<link rel="next" href="${next}">` : ''}</head><body><section class="postlist"><div class="articles">${cards.join('')}</div></section></body></html>`;
const P2 = 'https://trap.jp/author/cp20/page/2/';
const fail = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

describe('parseAuthorPage', () => {
  test('記事カードを記事名・URL・日本時間の日付にする', () => {
    assert.deepEqual(parseAuthorPage(page(null, card(2949, '「A &amp; B」 ー 3班', '2026年7月5日'))), [
      { url: 'https://trap.jp/post/2949/', title: '「A & B」 ー 3班', day: '2026-07-05T00:00:00+09:00' },
    ]);
  });

  test('日付のないカードは、マークアップが変わったとして失敗にする', () => {
    assert.throws(
      () => parseAuthorPage('<a href="/post/1/" class="article"><strong>no date</strong></a>'),
      /markup/,
    );
  });
});

describe('nextPage', () => {
  test('head の rel="next" を次のページにする', () => {
    assert.equal(
      nextPage('<head><link rel="next" href="https://trap.jp/author/cp20/page/4/"></head>'),
      'https://trap.jp/author/cp20/page/4/',
    );
  });

  test('body の中の rel="next" は使わない', () => {
    assert.equal(nextPage('<head></head><body><link rel="next" href="x"></body>'), null);
  });
});

describe('fetchTrapPosts', () => {
  const site: Record<string, string> = {
    'https://trap.jp/author/cp20/rss/':
      '<rss><channel><item><title>x</title><link>https://trap.jp/post/3/</link><pubDate>Sun, 05 Jul 2026 09:00:48 GMT</pubDate></item></channel></rss>',
    'https://trap.jp/author/cp20/': page(P2, card(3, 'three'), card(2, 'two')),
    [P2]: page(null, card(1, 'one', '2023年6月1日')),
  };
  const crawl = async () => {
    const requested: [string, string][] = [];
    const posts = await fetchTrapPosts(async (url, format) => {
      requested.push([url, format]);
      if (!(url in site)) throw fail(404);
      return site[url];
    }, article);
    return { posts, requested };
  };

  test('rel="next" をたどって全ページの記事を集め、RSS にある記事はその時刻を使う', async () => {
    const { posts } = await crawl();
    assert.deepEqual(
      posts.map((p) => [p.url, p.date]),
      [
        ['https://trap.jp/post/3/', '2026-07-05T09:00:48.000Z'],
        ['https://trap.jp/post/2/', '2026-07-04T15:00:00.000Z'],
        ['https://trap.jp/post/1/', '2023-05-31T15:00:00.000Z'],
      ],
    );
  });

  test('rel="next" のない最後のページより先は読まない', async () => {
    const { requested } = await crawl();
    assert.deepEqual(requested.at(-1), [P2, 'html']);
  });

  // The first page links to P2; `second` answers P2 (RSS is optional and down).
  const crawlWith = (second: () => Promise<string>, next = P2) =>
    fetchTrapPosts(async (url) => {
      if (url.endsWith('/rss/')) throw fail(503);
      if (url === 'https://trap.jp/author/cp20/') return page(next, card(2, 'two'));
      if (url === P2) return second();
      throw fail(404);
    }, article);

  test('RSS が落ちていても、著者ページだけで集める', async () => {
    assert.equal((await crawlWith(async () => page(null, card(1, 'one')))).length, 2);
  });

  for (const [why, second, next, error] of [
    ['途中のページが取れない', async () => Promise.reject(fail(503)), P2, /503/],
    ['途中のページに記事がない', async () => page(null), P2, /listed no posts/],
    [
      '新しい記事で一覧がずれて、同じ記事が2ページに出る',
      async () => page(null, card(2, 'two')),
      P2,
      /two pages/,
    ],
    [
      '次のページが別のサイトを指す',
      async () => page(null),
      'https://evil.example/page/2/',
      /unexpected next page/,
    ],
  ] as [string, () => Promise<string>, string, RegExp][])
    test(`${why}ときは、途中までの一覧を返さず失敗にする`, async () => {
      await assert.rejects(crawlWith(second, next), error);
    });

  test('著者ページのつくりが変わったら失敗にする', async () => {
    await assert.rejects(
      fetchTrapPosts(async (url) => (url.endsWith('/rss/') ? '<rss/>' : '<html>redesigned</html>'), article),
    );
  });

  test('取得に失敗したら、収集では前回の trap.jp の記事を残して stale にする', async () => {
    const previous = {
      articles: [article('kept', 'https://trap.jp/post/9/', '2025-01-01', 'trap.jp')],
      repos: [],
      sources: { 'trap.jp': { status: 'ok' } },
      updatedAt: '2025-01-01',
    };
    const failed = await collect(previous, {
      'trap.jp': () => crawlWith(async () => Promise.reject(fail(500))),
      'zenn.dev': async () => [article('z', 'https://zenn.dev/cp20/articles/1', '2026-01-01', 'zenn.dev')],
    });
    assert.deepEqual(
      [failed.sources['trap.jp'].status, failed.articles.some((a) => a.url === 'https://trap.jp/post/9/')],
      ['stale', true],
    );
  });
});
