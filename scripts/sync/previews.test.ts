// Reading the pages the site links for their preview image and icon, from HTML nobody here controls.
import { describe, onTestFinished, test } from 'vitest';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { keepReferenced, parsePreview, reachable, syncPreviews, withStated } from './previews.ts';
import { ogImage } from './picks.ts';
import { tempDirs } from './temp-dirs.ts';

const og = (value: string) => `<meta property="og:image" content="${value}">`;

describe('parsePreview', () => {
  const page = `<meta content="/og/default?v=4&amp;lang=ja" property="og:image">
    <meta property='og:image:width' content='1200'><meta property='og:image:height' content='600'>
    <link rel="icon" href="/favicon.ico"><link rel="apple-touch-icon" href="/apple.png?v=3">`;

  test('相対 URL の OG 画像はページの URL から解決し、クエリを保つ', () => {
    assert.equal(
      parsePreview(page, 'https://example.com/works').image,
      'https://example.com/og/default?v=4&lang=ja',
    );
  });

  test('アイコンは apple-touch-icon を選ぶ', () => {
    assert.equal(parsePreview(page, 'https://example.com/works').icon, 'https://example.com/apple.png?v=3');
  });

  test('http の OG 画像より og:image:secure_url を使う', () => {
    const html = `${og('http://example.com/insecure.png')}<meta property="og:image:secure_url" content="https://example.com/secure.png">`;
    assert.equal(parsePreview(html, 'https://example.com').image, 'https://example.com/secure.png');
  });

  test('OG 画像がなければ Twitter カードの画像を使う', () => {
    const html = '<meta name="twitter:image" content="//cdn.example.com/card.png">';
    assert.equal(parsePreview(html, 'https://example.com').image, 'https://cdn.example.com/card.png');
  });

  for (const value of ['javascript:alert(1)', 'http://example.com/a.png', 'https://user:password@example.com/a.png'])
    test(`安全でない画像 URL ${JSON.stringify(value)} は使わない`, () => {
      assert.equal(parsePreview(og(value), 'https://example.com').image, null);
    });

  test('画像の指定がなければ null', () => {
    assert.equal(parsePreview('<html></html>', 'https://example.com').image, null);
  });
});

describe('OG 画像の大きさ', () => {
  const page = (w: string, h: string) =>
    `${og('https://example.com/a.png')}<meta property="og:image:width" content="${w}"><meta property="og:image:height" content="${h}">`;
  const size = (w: string, h: string) => {
    const { width, height } = parsePreview(page(w, h), 'https://example.com');
    return [width, height];
  };

  test('書かれた大きさが 1〜10000 の整数なら、そのまま使う', () => {
    assert.deepEqual(size('800', '400'), [800, 400]);
  });

  for (const [w, h] of [
    ['1e999', '-3'],
    ['0', 'NaN'],
    ['12.5', '99999'],
  ])
    test(`${w}×${h} は 1〜10000 の範囲外なので、既定の 1200×630 にする`, () => {
      assert.deepEqual(size(w, h), [1200, 630]);
    });
});

test('サイトがもうリンクしないページの情報は捨て、残りは元の順に保つ', () => {
  const previews = {
    'https://a.example/': { image: 'a' },
    'https://old.example/': { image: 'o' },
    'https://b.example/': {},
  };
  assert.deepEqual(
    keepReferenced(previews, ['https://b.example/', 'https://a.example/', 'https://new.example/']),
    {
      'https://a.example/': { image: 'a' },
      'https://b.example/': {},
    },
  );
});

describe('works.json に書いた画像とアイコン', () => {
  const page = {
    image: 'https://github.com/og.png',
    icon: 'https://github.com/favicon.png',
    width: 1200,
    height: 600,
  };

  test('ページのものより優先する', () => {
    const { image, icon } = withStated(page, {
      image: 'https://a.example/og.png',
      icon: 'https://a.example/i.png',
    });
    assert.deepEqual([image, icon], ['https://a.example/og.png', 'https://a.example/i.png']);
  });

  test('icon: null ならアイコンを付けない', () => {
    assert.equal(withStated(page, { icon: null }).icon, null);
  });

  test('書いていなければページのものを使う', () => {
    assert.deepEqual(withStated(page, {}), page);
    assert.deepEqual(withStated(page, undefined), page);
  });
});

describe('悪意のある HTML を線形時間で読む', () => {
  const hostile = '<html><head>' + '<meta '.repeat(170_000) + 'a'.repeat(200_000);
  const names = ('<meta ' + 'a'.repeat(4000) + '>').repeat(250);
  // How long `run` takes, in milliseconds.
  const time = (run: () => void) => {
    const started = performance.now();
    run();
    return performance.now() - started;
  };

  for (const [what, html] of [
    ['閉じない meta タグ', hostile],
    ['長い属性名の meta タグ', names],
  ])
    test(`${what}が大量にあっても、プレビューは2秒以内に「画像なし」になり、漫画のページなら失敗する`, () => {
      let image;
      assert.ok(time(() => (image = parsePreview(html, 'https://example.com').image)) < 2000);
      assert.equal(image, null);
      assert.throws(() => ogImage(html));
    });

  test('</head> のあとに何があっても、head の OG 画像を読む', () => {
    const page =
      '<head><meta property="og:image" content="https://public.ynjn.jp/a.jpg?x=1&amp;y=2"></head><body>' +
      '<meta '.repeat(100_000);
    let image;
    assert.ok(time(() => (image = ogImage(page))) < 1000);
    assert.equal(image, 'https://public.ynjn.jp/a.jpg?x=1&y=2');
  });
});

describe('アイコンの確認', () => {
  test('HEAD を断るサーバーでも、GET で取れればアイコンを使う', async () => {
    const asked: string[] = [];
    const fetcher = (async (_: string, init?: RequestInit) => {
      asked.push(init?.method ?? 'GET');
      return new Response('png', { status: init?.method === 'HEAD' ? 500 : 200 });
    }) as typeof fetch;
    assert.equal(await reachable('https://example.com/icon.png', fetcher), true);
    assert.deepEqual(asked, ['HEAD', 'GET']);
  });

  test('どちらでも取れなければ使わない', async () => {
    const fetcher = (async () => new Response('', { status: 404 })) as typeof fetch;
    assert.equal(await reachable('https://example.com/icon.png', fetcher), false);
  });
});

describe('syncPreviews', () => {
  const page = 'https://example.com/work';
  const noArticles = {
    manual: { projects: [], articles: [], exclude: [], overrides: {} },
    generated: { articles: [] },
  };
  async function dirsWith(data: Record<string, unknown>) {
    const box = await tempDirs({ ...noArticles, ...data });
    onTestFinished(box.cleanup);
    return box;
  }

  test('新しい画像を受け入れられなければ、前の画像をその大きさのまま残す', async () => {
    const box = await dirsWith({
      previews: {
        [page]: { image: 'https://example.com/og.png', icon: null, width: 1200, height: 600, checkedAt: '2000-01-01' },
      },
      works: [{ url: page }],
    });
    const html = `${og('https://example.com/og.svg')}<meta property="og:image:width" content="1e999">`;
    const svg = async () => new Response('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>');
    await syncPreviews(async () => html, { dirs: box.dirs, fetch: svg as unknown as typeof fetch });
    const { image, width, height } = (await box.load('previews'))[page];
    assert.deepEqual({ image, width, height }, { image: 'https://example.com/og.png', width: 1200, height: 600 });
  });

  test('ログインが必要で読めないページでも、works.json に書いた画像は使う', async () => {
    const members = 'https://members.example.com/';
    const box = await dirsWith({
      previews: {},
      works: [{ url: members, image: 'https://example.com/og.png', icon: null }],
    });
    const png = await sharp({ create: { width: 40, height: 21, channels: 3, background: '#fff' } })
      .png()
      .toBuffer();
    await syncPreviews(
      async () => {
        throw Error('Redirected to the login page');
      },
      { dirs: box.dirs, fetch: (async () => new Response(png)) as unknown as typeof fetch },
    );
    const { image, icon, width, height } = (await box.load('previews'))[members];
    assert.deepEqual(
      { image, icon, width, height },
      { image: 'https://example.com/og.png', icon: null, width: 40, height: 21 },
    );
  });
});
