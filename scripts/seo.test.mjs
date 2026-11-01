// Regression tests for crawler-facing output: the RSS feed, 404 indexing and heading structure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';
import { buildFeed, feedTitle, feedUrl } from './feed.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');
const article = (n, date, source = 'zenn.dev') => ({
  title: `記事 ${n} <&>`,
  url: `https://example.com/${n}`,
  date,
  source,
});

test('feed has an Atom self link, lastBuildDate, item descriptions and every article', () => {
  const articles = Array.from({ length: 60 }, (_, i) =>
    article(i, new Date(Date.UTC(2020, 0, 60 - i)).toISOString(), i % 2 ? 'trap.jp' : 'zenn.dev'),
  );
  const xml = buildFeed(articles);
  const feed = new XMLParser({ ignoreAttributes: false }).parse(xml);
  const channel = feed.rss.channel;
  assert.equal(feed.rss['@_xmlns:atom'], 'http://www.w3.org/2005/Atom');
  assert.deepEqual(
    [channel['atom:link']['@_href'], channel['atom:link']['@_rel'], channel['atom:link']['@_type']],
    [feedUrl, 'self', 'application/rss+xml'],
  );
  assert.equal(channel.title, feedTitle);
  assert.equal(channel.lastBuildDate, new Date(articles[0].date).toUTCString());
  assert.equal(channel.item.length, 60);
  assert.equal(channel.item[1].description, 'trap.jp に掲載');
  assert.equal(channel.item[0].title, '記事 0 <&>');
});

test('lastBuildDate follows the newest article even when the list is not sorted', () => {
  const xml = buildFeed([article(1, '2021-01-01T00:00:00.000Z'), article(2, '2024-05-06T00:00:00.000Z')]);
  assert.match(xml, new RegExp(`<lastBuildDate>${new Date('2024-05-06T00:00:00Z').toUTCString()}<`));
  assert.doesNotMatch(buildFeed([]), /lastBuildDate/);
});

test('the feed title matches the alternate link in the document head', () => {
  assert.ok(read('src/Document.tsx').includes(`title="${feedTitle}"`));
});

test('a direct GET /404 is served with X-Robots-Tag: noindex', () => {
  assert.match(read('public/_headers'), /^\/404\n {2}X-Robots-Tag: noindex$/m);
});

const built = (path) => join(root, 'dist/client', path);
const skip = !existsSync(built('404.html')) && 'run `npm run build` first';
const headings = (html) =>
  [...html.replace(/<template[\s\S]*?<\/template>/g, '').matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/g)].map(
    ([, level, text]) => ({ level: +level, text: text.replace(/<[^>]+>|<!--.*?-->/g, '').trim() }),
  );

test('built 404 page is noindex and has no canonical or og:url', { skip }, () => {
  const head = readFileSync(built('404.html'), 'utf8').split('</head>')[0];
  assert.match(head, /<meta\b[^>]*name="robots" content="noindex"/);
  assert.doesNotMatch(head, /rel="canonical"|property="og:url"/);
  const home = readFileSync(built('index.html'), 'utf8').split('</head>')[0];
  assert.match(home, /<link\b[^>]*rel="canonical" href="https:\/\/cp20\.dev\/"/);
  assert.doesNotMatch(home, /name="robots"/);
});

test('built pages never skip a heading level, and / and /about have distinct h1s', { skip }, () => {
  for (const page of ['index.html', 'about/index.html', 'articles/index.html', 'works/index.html']) {
    let previous = 0;
    for (const h of headings(readFileSync(built(page), 'utf8'))) {
      assert.ok(h.level <= previous + 1, `${page}: h${h.level} "${h.text}" follows h${previous}`);
      previous = h.level;
    }
  }
  const h1 = (page) => headings(readFileSync(built(page), 'utf8')).find((h) => h.level === 1).text;
  assert.notEqual(h1('index.html'), h1('about/index.html'));
  assert.match(h1('about/index.html'), /プロフィール/);
});
