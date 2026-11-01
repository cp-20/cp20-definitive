// What crawlers see: the RSS feed, and the built pages' heads and heading structure.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';
import { buildFeed, feedTitle, feedUrl } from './feed.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const article = (n, date, source = 'zenn.dev') => ({
  title: `記事 ${n} <&>`,
  url: `https://example.com/${n}`,
  date,
  source,
});

describe('buildFeed', () => {
  const articles = Array.from({ length: 60 }, (_, i) =>
    article(i, new Date(Date.UTC(2020, 0, 60 - i)).toISOString(), i % 2 ? 'trap.jp' : 'zenn.dev'),
  );
  const channel = () => new XMLParser({ ignoreAttributes: false }).parse(buildFeed(articles)).rss.channel;

  test('Atom の self リンクでフィード自身の URL を示す', () => {
    const link = channel()['atom:link'];
    assert.deepEqual(
      [link['@_href'], link['@_rel'], link['@_type']],
      [feedUrl, 'self', 'application/rss+xml'],
    );
  });

  test('チャンネル名はサイトのフィード名', () => {
    assert.equal(channel().title, feedTitle);
  });

  test('すべての記事を載せる', () => {
    assert.equal(channel().item.length, 60);
  });

  test('記事の説明には掲載先を書く', () => {
    assert.equal(channel().item[1].description, 'trap.jp に掲載');
  });

  test('記事名の記号は、読み戻すと元の文字になる', () => {
    assert.equal(channel().item[0].title, '記事 0 <&>');
  });

  test('lastBuildDate は最新の記事の日時（並んでいなくても）', () => {
    const xml = buildFeed([article(1, '2021-01-01T00:00:00.000Z'), article(2, '2024-05-06T00:00:00.000Z')]);
    const parsed = new XMLParser().parse(xml).rss.channel;
    assert.equal(parsed.lastBuildDate, new Date('2024-05-06T00:00:00Z').toUTCString());
  });

  test('記事がなければ lastBuildDate を書かない', () => {
    assert.equal(new XMLParser().parse(buildFeed([])).rss.channel.lastBuildDate, undefined);
  });
});

const built = (path) => join(root, 'dist/client', path);
const skip = !existsSync(built('404.html')) && 'run `npm run build` first';
const headings = (html) =>
  [...html.replace(/<template[\s\S]*?<\/template>/g, '').matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/g)].map(
    ([, level, text]) => ({ level: +level, text: text.replace(/<[^>]+>|<!--.*?-->/g, '').trim() }),
  );

test.skipIf(skip)('ビルドしたページは、フィードをその名前でリンクする', () => {
  const head = readFileSync(built('index.html'), 'utf8').split('</head>')[0];
  assert.ok(head.includes(`title="${feedTitle}"`));
});

const head = (page) => readFileSync(built(page), 'utf8').split('</head>')[0];
// The heading levels that come more than one level below the one before them.
const skipped = (page) =>
  headings(readFileSync(built(page), 'utf8'))
    .filter((h, i, all) => h.level > (i ? all[i - 1].level : 0) + 1)
    .map((h) => `h${h.level} ${h.text}`);
const h1 = (page) => headings(readFileSync(built(page), 'utf8')).find((h) => h.level === 1).text;

test.skipIf(skip)('404 ページは、検索エンジンに載せないよう求める', () => {
  assert.match(head('404.html'), /<meta\b[^>]*name="robots" content="noindex"/);
});

test.skipIf(skip)('404 ページは、正規 URL を名乗らない', () => {
  assert.doesNotMatch(head('404.html'), /rel="canonical"|property="og:url"/);
});

test.skipIf(skip)('トップページは、正規 URL を名乗り、検索エンジンに載せてよい', () => {
  assert.deepEqual(
    [
      /<link\b[^>]*rel="canonical" href="https:\/\/cp20\.dev\/"/.test(head('index.html')),
      head('index.html').includes('name="robots"'),
    ],
    [true, false],
  );
});

for (const page of ['index.html', 'about/index.html', 'articles/index.html', 'works/index.html'])
  test.skipIf(skip)(`${page} の見出しは、レベルを飛ばさない`, () => {
    assert.deepEqual(skipped(page), []);
  });

test.skipIf(skip)('/ と /about の h1 は別の文で、/about のものはプロフィールを名乗る', () => {
  assert.deepEqual(
    [h1('index.html') !== h1('about/index.html'), h1('about/index.html').includes('プロフィール')],
    [true, true],
  );
});
