// Collecting the article list: feeds, paginated APIs, what each source answers, and a source
// that is down or shrinks.
import { afterEach, describe, test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { article, type Article, type Repo, type Snapshot } from '../../src/content/normalize.ts';
import { collect, githubRepo, paginated, parseFeed, request, zennArticle } from './sync.ts';

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
const now = '2026-09-01T00:00:00Z';

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

describe('request', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  // A fetch that answers from `answers` in turn and records each request.
  const fetchOf = (...answers: (() => Response)[]) => {
    const asked: { url: string; headers: Record<string, string> }[] = [];
    const fetch = (async (url: string, init: RequestInit) => {
      asked.push({ url, headers: init.headers as Record<string, string> });
      return answers[asked.length - 1]();
    }) as unknown as typeof globalThis.fetch;
    return { fetch, asked };
  };
  const big = () => new Response('x'.repeat(3000));

  test('HTML の head を読むときは、上限で切り詰める', async () => {
    const { fetch } = fetchOf(big);
    const html = await request('https://example.com', { format: 'html', fetch, maxBytes: 1000, truncate: true });
    assert.equal(html.length, 1000);
  });

  test('それ以外では、上限を超えたら再試行せずに失敗にする', async () => {
    const { fetch, asked } = fetchOf(big, big);
    await assert.rejects(request('https://example.com', { format: 'html', fetch, maxBytes: 1000 }), /exceeds/);
    assert.equal(asked.length, 1);
  });

  test('混んでいたサーバーには1回だけ聞き直し、404 には聞き直さない', async () => {
    const busy = fetchOf(
      () => new Response('busy', { status: 503 }),
      () => Response.json({ ok: true }),
    );
    assert.deepEqual(await request('https://example.com', { fetch: busy.fetch, retryDelay: 0 }), { ok: true });
    const gone = fetchOf(() => new Response('', { status: 404 }));
    await assert.rejects(request('https://example.com', { fetch: gone.fetch, retryDelay: 0 }), /404/);
    assert.deepEqual([busy.asked.length, gone.asked.length], [2, 1]);
  });

  test('GITHUB_TOKEN は api.github.com にだけ送る', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'secret');
    const { fetch, asked } = fetchOf(
      () => Response.json([]),
      () => Response.json([]),
    );
    await request('https://api.github.com/users/cp-20/repos', { fetch });
    await request('https://zenn.dev/api/articles', { fetch });
    assert.deepEqual(
      asked.map((r) => r.headers.Authorization),
      ['Bearer secret', undefined],
    );
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

describe('各掲載先の応答', () => {
  test('Zenn の記事は path から URL を作り、公開日時を UTC にそろえる', () => {
    assert.deepEqual(
      zennArticle({ title: 'A', path: '/cp20/articles/a', published_at: '2026-01-02T09:00:00+09:00' }),
      { title: 'A', url: 'https://zenn.dev/cp20/articles/a', date: '2026-01-02T00:00:00.000Z', source: 'zenn.dev' },
    );
  });

  test('GitHub のリポジトリは、名前と push 日時がなければ受け付けない', () => {
    const repo = { name: 'a', html_url: 'https://github.com/cp-20/a', pushed_at: '2026-01-01T00:00:00Z' };
    assert.equal(githubRepo(repo).url, 'https://github.com/cp-20/a');
    assert.throws(() => githubRepo({ ...repo, name: 1 }));
    assert.throws(() => githubRepo({ ...repo, pushed_at: 'yesterday' }));
  });
});

describe('collect', () => {
  test('取得に失敗した掲載先は前回の記事を残し、stale にして最後に成功した日時を保つ', async () => {
    const next = await collect(
      previous(),
      { 'zenn.dev': offline, 'note.com': async () => parseFeed(noteFeed, 'note.com') },
      { now },
    );
    const { status, lastSuccess } = next.sources['zenn.dev'];
    assert.ok(next.articles.some((a) => a.url === old.url));
    assert.deepEqual({ status, lastSuccess }, { status: 'stale', lastSuccess: '2024-01-01' });
  });

  test('すべての掲載先が失敗したら、収集そのものを失敗にする', async () => {
    await assert.rejects(collect(previous(), { broken: offline }));
  });

  test('何も変わらなければ updatedAt を変えない', async () => {
    const same = await collect(previous(), { 'zenn.dev': async () => [old] }, { now });
    assert.equal(same.updatedAt, '2024-01-01');
  });

  test('GitHub からは、フォークでもアーカイブでもない自分のリポジトリを、新しく push した順に載せる', async () => {
    const repo = (name: string, updatedAt: string, fields: Partial<Repo> = {}): Repo => ({
      name,
      url: `https://github.com/cp-20/${name}`,
      description: '',
      language: '',
      stars: 0,
      updatedAt,
      fork: false,
      archived: false,
      ...fields,
    });
    const next = await collect(
      previous(),
      {
        'github.com': async () => [
          repo('old', '2024-01-01'),
          repo('forked', '2026-01-01', { fork: true }),
          repo('new', '2025-01-01'),
          repo('archived', '2026-02-01', { archived: true }),
        ],
      },
      { now },
    );
    assert.deepEqual(
      next.repos.map((r) => r.name),
      ['new', 'old'],
    );
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
      { now, allowShrink: false },
    );
    assert.deepEqual([result.sources['trap.jp'].status, trapCount(result)], ['stale', 10]);
  });

  test('明示的に許したら、減った3件を受け入れる', async () => {
    const result = await collect(
      before,
      { 'trap.jp': async () => articles.slice(0, 3), 'zenn.dev': zenn },
      { now, allowShrink: true },
    );
    assert.equal(trapCount(result), 3);
  });

  test('半分以上残っていれば、そのまま受け入れる', async () => {
    const result = await collect(before, { 'trap.jp': async () => articles.slice(0, 6) }, { now, allowShrink: false });
    assert.equal(result.sources['trap.jp'].status, 'ok');
  });

  test('作品が関連記事にしている記事は、著者ページから消えても残し、ほかの消えた記事は除く', async () => {
    const pinned = new Set(['https://trap.jp/post/0/']);
    const unlinked = { ...before, sources: {} };
    const trapUrls = (s: Snapshot) =>
      s.articles
        .filter((a) => a.source === 'trap.jp')
        .map((a) => a.url)
        .sort();
    const kept = await collect(unlinked, { 'trap.jp': async () => articles.slice(1) }, { now, pinned });
    assert.deepEqual(trapUrls(kept), articles.map((a) => a.url).sort());
    const pruned = await collect(unlinked, { 'trap.jp': async () => articles.slice(2) }, { now, pinned });
    assert.deepEqual(trapUrls(pruned), articles.filter((_, i) => i !== 1).map((a) => a.url).sort());
  });
});
