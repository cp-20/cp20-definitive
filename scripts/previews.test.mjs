import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parsePreview, keepReferenced } from './previews.mjs';

test('original OG image dimensions, relative icons and query parameters are preserved', () => {
  assert.deepEqual(
    parsePreview(
      `<meta content="/og/default?v=4&amp;lang=ja" property="og:image">
    <meta property='og:image:width' content='1200'><meta property='og:image:height' content='600'>
    <link rel="icon" href="/favicon.ico"><link rel="apple-touch-icon" href="/apple.png?v=3">`,
      'https://example.com/works',
    ),
    {
      image: 'https://example.com/og/default?v=4&lang=ja',
      icon: 'https://example.com/apple.png?v=3',
      width: 1200,
      height: 600,
    },
  );
});
test('secure OG and Twitter fallback; missing or unsafe URLs never become images', () => {
  assert.equal(
    parsePreview(
      '<meta property="og:image" content="http://example.com/insecure.png"><meta property="og:image:secure_url" content="https://example.com/secure.png">',
      'https://example.com',
    ).image,
    'https://example.com/secure.png',
  );
  assert.equal(
    parsePreview('<meta name="twitter:image" content="//cdn.example.com/card.png">', 'https://example.com')
      .image,
    'https://cdn.example.com/card.png',
  );
  for (const value of [
    '',
    'javascript:alert(1)',
    'http://example.com/a.png',
    'https://user:password@example.com/a.png',
  ]) {
    assert.equal(
      parsePreview(`<meta property="og:image" content="${value}">`, 'https://example.com').image,
      null,
    );
  }
  assert.equal(parsePreview('<html></html>', 'https://example.com').image, null);
});

test('metadata for pages the site no longer links to is dropped, keeping the existing order', () => {
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

test("works never link to or take their preview from another publisher's Marketplace listing", async () => {
  const works = JSON.parse(await readFile(new URL('../src/data/works.json', import.meta.url), 'utf8'));
  const previews = JSON.parse(await readFile(new URL('../src/data/previews.json', import.meta.url), 'utf8'));
  for (const work of works) {
    const url = new URL(work.url);
    if (url.hostname !== 'marketplace.visualstudio.com') continue;
    assert.equal(url.searchParams.get('itemName')?.split('.')[0], 'cp20', work.id);
    const image = previews[work.url]?.image;
    if (image) assert.match(new URL(image).hostname, /^cp20\.gallerycdn\.vsassets\.io$/, work.id);
  }
  assert.equal(
    works.find((w) => w.id === 'foodmoji').url,
    'https://marketplace.visualstudio.com/items?itemName=cp20.foodmoji-vscode',
  );
});
