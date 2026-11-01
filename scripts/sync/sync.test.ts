// Collecting the article list: feeds, paginated APIs, and a source that is down or shrinks.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { article, type Article } from '../../src/content/normalize.ts';
import { collect, paginated, parseFeed, request, type Snapshot } from './sync.ts';

const old: Article = {
  title: 'Old',
  url: 'https://zenn.dev/cp20/articles/a',
  source: 'zenn.dev',
  date: '2024-01-01T00:00:00.000Z',
};
const noteFeed =
  '<rss><channel><item><title><![CDATA[A & B]]></title><link>https://note.com/cp20/n/a</link><pubDate>Tue, 01 Sep 2026 00:00:00 GMT</pubDate></item></channel></rss>';
const previous = (): Snapshot => ({
  articles: [old],
  repos: [],
  sources: { 'zenn.dev': { status: 'ok', lastSuccess: '2024-01-01' } },
  updatedAt: '2024-01-01',
});
const offline = async (): Promise<Article[]> => {
  throw Error('offline');
};
// zenn.dev is down while note.com answers.
const zennDown = { 'zenn.dev': offline, 'note.com': async () => parseFeed(noteFeed, 'note.com') };

describe('parseFeed', () => {
  const item = (title: string, n: number, date = 'Tue, 01 Sep 2026 00:00:00 GMT') =>
    `<item><title>${title}</title><link>https://note.com/cp20/n/${n}</link><pubDate>${date}</pubDate></item>`;

  test('CDATA の記事名を読む', () => {
    assert.equal(parseFeed(noteFeed, 'note.com')[0].title, 'A & B');
  });

  test('RSS でない文書は失敗にする', () => {
    assert.throws(() => parseFeed('<not-rss/>', 'note.com'));
  });

  test('数値や真偽値に見える記事名も文字列のまま読み、16進の文字参照を解く', () => {
    const titles = ['2024', '1e3', 'true', '0x1F', ' 007 ', '&#x3C;b&#x3E;'];
    const rows = parseFeed(
      `<rss><channel>${titles.map((t, n) => item(t, n)).join('')}</channel></rss>`,
      'note.com',
    );
    assert.deepEqual(
      rows.map((r) => r.title),
      ['2024', '1e3', 'true', '0x1F', '007', '<b>'],
    );
  });

  test('日付の読めない記事が1件あっても、ほかの記事は読む', () => {
    const rows = parseFeed(
      `<rss><channel>${item('ok', 1)}${item('bad', 9, 'not a date')}</channel></rss>`,
      'note.com',
    );
    assert.deepEqual(
      rows.map((r) => r.title),
      ['ok'],
    );
  });

  test('読める記事が1件もなければ失敗にする', () => {
    assert.throws(() =>
      parseFeed(`<rss><channel>${item('bad', 1, 'not a date')}</channel></rss>`, 'note.com'),
    );
  });
});

describe('レスポンスの大きさの上限', () => {
  const big = async () => new Response('x'.repeat(3000));
  test('HTML の head を読むときは、上限で切り詰める', async () => {
    const html = await request('https://example.com', 'html', big, {}, { maxBytes: 1000, truncate: true });
    assert.equal(html.length, 1000);
  });

  test('それ以外では、上限を超えたら失敗にする', async () => {
    await assert.rejects(request('https://example.com', 'html', big, {}, { maxBytes: 1000 }));
  });
});

test('paginated は続きがある間ページを読み進める', async () => {
  const rows = await paginated(
    async (n) => (n < 3 ? [n] : []),
    (x) => x,
    (x) => x,
    (_, page) => page.length > 0,
  );
  assert.deepEqual(rows, [1, 2]);
});

describe('collect', () => {
  test('取得に失敗した掲載先は、前回の記事を残す', async () => {
    const next = await collect(previous(), zennDown, '2026-09-01T00:00:00Z');
    assert.ok(next.articles.some((a) => a.url === old.url));
  });

  test('取得に失敗した掲載先は stale になり、最後に成功した日時を保つ', async () => {
    const next = await collect(previous(), zennDown, '2026-09-01T00:00:00Z');
    const { status, lastSuccess } = next.sources['zenn.dev'];
    assert.deepEqual({ status, lastSuccess }, { status: 'stale', lastSuccess: '2024-01-01' });
  });

  test('すべての掲載先が失敗したら、収集そのものを失敗にする', async () => {
    await assert.rejects(collect(previous(), { broken: offline }));
  });

  test('何も変わらなければ updatedAt を変えない', async () => {
    const same = await collect(previous(), { 'zenn.dev': async () => [old] }, '2026-09-01T00:00:00Z');
    assert.equal(same.updatedAt, '2024-01-01');
  });
});

describe('trap.jp の記事が急に減ったとき', () => {
  const articles = Array.from({ length: 10 }, (_, i) =>
    article(`p${i}`, `https://trap.jp/post/${i}/`, '2025-01-01', 'trap.jp'),
  );
  const before: Snapshot = {
    articles,
    repos: [],
    sources: { 'trap.jp': { status: 'ok' } },
    updatedAt: '2025-01-01',
  };
  const zenn = async () => [article('z', 'https://zenn.dev/cp20/articles/1', '2026-01-01', 'zenn.dev')];
  const trapCount = (result: Snapshot) => result.articles.filter((a) => a.source === 'trap.jp').length;

  test('半分未満に減ったら stale にして、前回の10件を残す', async () => {
    const result = await collect(
      before,
      { 'trap.jp': async () => articles.slice(0, 3), 'zenn.dev': zenn },
      'now',
      false,
    );
    assert.deepEqual([result.sources['trap.jp'].status, trapCount(result)], ['stale', 10]);
  });

  test('明示的に許したら、減った3件を受け入れる', async () => {
    const result = await collect(
      before,
      { 'trap.jp': async () => articles.slice(0, 3), 'zenn.dev': zenn },
      'now',
      true,
    );
    assert.equal(trapCount(result), 3);
  });

  test('半分以上残っていれば、そのまま受け入れる', async () => {
    const result = await collect(before, { 'trap.jp': async () => articles.slice(0, 6) }, 'now', false);
    assert.equal(result.sources['trap.jp'].status, 'ok');
  });

  test('作品が関連記事にしている記事は、著者ページから消えても残す', async () => {
    const pinned = new Set(['https://trap.jp/post/0/']);
    const unlinked = { ...before, sources: {} };
    const next = await collect(unlinked, { 'trap.jp': async () => articles.slice(1) }, 'now', false, pinned);
    assert.equal(next.sources['trap.jp'].status, 'ok');
    assert.deepEqual(
      next.articles
        .filter((a) => a.source === 'trap.jp')
        .map((a) => a.url)
        .sort(),
      articles.map((a) => a.url).sort(),
    );
    // Unlinked posts are still removed.
    const pruned = await collect(
      unlinked,
      { 'trap.jp': async () => articles.slice(2) },
      'now',
      false,
      pinned,
    );
    assert.equal(pruned.articles.filter((a) => a.source === 'trap.jp').length, 9);
  });
});
