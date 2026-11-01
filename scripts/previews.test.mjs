// Reading a page's preview image and icon from its HTML.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parsePreview, keepReferenced } from './previews.mjs';

const og = (value) => `<meta property="og:image" content="${value}">`;

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

  test('書かれた OG 画像の大きさを使う', () => {
    const { width, height } = parsePreview(page, 'https://example.com/works');
    assert.deepEqual([width, height], [1200, 600]);
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

  for (const value of [
    '',
    'javascript:alert(1)',
    'http://example.com/a.png',
    'https://user:password@example.com/a.png',
  ])
    test(`安全でない画像 URL ${JSON.stringify(value)} は使わない`, () => {
      assert.equal(parsePreview(og(value), 'https://example.com').image, null);
    });

  test('画像の指定がなければ null', () => {
    assert.equal(parsePreview('<html></html>', 'https://example.com').image, null);
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

describe('Marketplace の作品', async () => {
  const load = async (name) =>
    JSON.parse(await readFile(new URL(`../src/data/${name}.json`, import.meta.url), 'utf8'));
  const [works, previews] = await Promise.all([load('works'), load('previews')]);
  const listed = works.filter((w) => new URL(w.url).hostname === 'marketplace.visualstudio.com');

  test('リンクするのは cp20 が公開した拡張だけ', () => {
    assert.deepEqual(
      listed
        .filter((w) => new URL(w.url).searchParams.get('itemName')?.split('.')[0] !== 'cp20')
        .map((w) => w.id),
      [],
    );
  });

  test('プレビュー画像は cp20 の配信元から取る', () => {
    assert.deepEqual(
      listed
        .filter(
          (w) =>
            previews[w.url]?.image &&
            new URL(previews[w.url].image).hostname !== 'cp20.gallerycdn.vsassets.io',
        )
        .map((w) => w.id),
      [],
    );
  });

  test('foodmoji は VS Code 版の拡張にリンクする', () => {
    assert.equal(
      works.find((w) => w.id === 'foodmoji').url,
      'https://marketplace.visualstudio.com/items?itemName=cp20.foodmoji-vscode',
    );
  });
});
