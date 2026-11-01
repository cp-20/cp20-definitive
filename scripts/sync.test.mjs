// Collecting the article list: feeds, merging with the archive and the editor's overrides, and
// keeping the last snapshot of a source that is down.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { collect, mergeArticles, paginated, parseFeed, safeUrl } from './sync.mjs';

const old = {
  title: 'Old',
  url: 'https://zenn.dev/cp20/articles/a',
  source: 'zenn.dev',
  date: '2024-01-01T00:00:00.000Z',
};
const noteFeed =
  '<rss><channel><item><title><![CDATA[A & B]]></title><link>https://note.com/cp20/n/a</link><pubDate>Tue, 01 Sep 2026 00:00:00 GMT</pubDate></item></channel></rss>';
const noManual = { articles: [], exclude: [], overrides: {} };
const previous = () => ({
  articles: [old],
  repos: [],
  sources: { 'zenn.dev': { status: 'ok', lastSuccess: '2024-01-01' } },
  updatedAt: '2024-01-01',
});
const offline = async () => {
  throw Error('offline');
};
// zenn.dev is down while note.com answers.
const zennDown = { 'zenn.dev': offline, 'note.com': async () => parseFeed(noteFeed, 'note.com') };

describe('parseFeed', () => {
  test('CDATA の記事名を読む', () => {
    assert.equal(parseFeed(noteFeed, 'note.com')[0].title, 'A & B');
  });

  test('RSS でない文書は失敗にする', () => {
    assert.throws(() => parseFeed('<not-rss/>', 'note.com'));
  });
});

test('javascript: の URL は受け付けない', () => {
  assert.throws(() => safeUrl('javascript:alert(1)'));
});

describe('mergeArticles', () => {
  test('編集者の上書きは、取得した記事名より優先する', () => {
    const manual = { ...noManual, overrides: { [old.url]: { title: 'editor' } } };
    assert.equal(mergeArticles([old], [{ ...old, title: 'new' }], manual)[0].title, 'editor');
  });

  test('過去の記事と新しく取得した記事を合わせる', () => {
    assert.equal(mergeArticles([old], parseFeed(noteFeed, 'note.com')).length, 2);
  });

  test('除外した記事は載せない', () => {
    assert.deepEqual(mergeArticles([old], [], { ...noManual, exclude: [old.url] }), []);
  });
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

test('paginated は続きがある間ページを読み進める', async () => {
  const rows = await paginated(
    async (n) => (n < 3 ? [n] : []),
    (x) => x,
    (x) => x,
    (_, page) => page.length > 0,
  );
  assert.deepEqual(rows, [1, 2]);
});
