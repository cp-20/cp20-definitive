// The RSS feed of the articles. What the build publishes is checked in dist.test.ts.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { XMLParser } from 'fast-xml-parser';
import { FEED, canonicalUrl } from '../../src/site/pages.ts';
import { buildFeed } from './prerender.ts';

const article = (n: number, date: string, source = 'zenn.dev') => ({
  title: `記事 ${n} <&>`,
  url: `https://example.com/${n}`,
  date,
  source,
});
const channel = (xml: string) => new XMLParser({ ignoreAttributes: false }).parse(xml).rss.channel;

describe('buildFeed', () => {
  const articles = Array.from({ length: 60 }, (_, i) =>
    article(i, new Date(Date.UTC(2020, 0, 60 - i)).toISOString(), i % 2 ? 'trap.jp' : 'zenn.dev'),
  );

  test('サイトのフィード名を名乗り、Atom の self リンクで自身の URL を示す', () => {
    const { title, 'atom:link': link } = channel(buildFeed(articles));
    assert.deepEqual(
      [title, link['@_href'], link['@_rel'], link['@_type']],
      [FEED.title, canonicalUrl(FEED.path), 'self', 'application/rss+xml'],
    );
  });

  test('すべての記事を載せ、説明には掲載先を書く', () => {
    const { item } = channel(buildFeed(articles));
    assert.deepEqual([item.length, item[1].description], [60, 'trap.jp に掲載']);
  });

  test('記事名の記号は、読み戻すと元の文字になる', () => {
    assert.equal(channel(buildFeed(articles)).item[0].title, '記事 0 <&>');
  });

  test('lastBuildDate は最新の記事の日時（並んでいなくても）で、記事がなければ書かない', () => {
    const xml = buildFeed([article(1, '2021-01-01T00:00:00.000Z'), article(2, '2024-05-06T00:00:00.000Z')]);
    assert.deepEqual(
      [channel(xml).lastBuildDate, channel(buildFeed([])).lastBuildDate],
      [new Date('2024-05-06T00:00:00Z').toUTCString(), undefined],
    );
  });
});
