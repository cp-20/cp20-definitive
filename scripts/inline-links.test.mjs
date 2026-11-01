// Links written inside work descriptions are rendered as links, not as bare URLs.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { splitLinks } from '../src/data/inline-links.mjs';
import { mergeWorks, sitePaths } from '../src/data/site-pages.mjs';

describe('splitLinks', () => {
  test('文と [label](href) のリンクを分ける', () => {
    assert.deepEqual(splitLinks('前に[ブログ](https://example.com/a)を、[去年](/works/x)も'), [
      { text: '前に' },
      { label: 'ブログ', href: 'https://example.com/a' },
      { text: 'を、' },
      { label: '去年', href: '/works/x' },
      { text: 'も' },
    ]);
  });

  test('リンクのない文はそのまま', () => {
    assert.deepEqual(splitLinks('リンクなし (@yui540 さん)'), [{ text: 'リンクなし (@yui540 さん)' }]);
  });

  test('http(s) とサイト内のパス以外はリンクにしない', () => {
    assert.deepEqual(splitLinks('[x](javascript:alert(1))'), [{ text: '[x](javascript:alert(1))' }]);
  });
});

describe('作品の説明文', async () => {
  const load = async (name) =>
    JSON.parse(await readFile(new URL(`../src/data/${name}.json`, import.meta.url), 'utf8'));
  const works = mergeWorks(await load('works'), await load('manual'));
  const comments = works.flatMap((work) =>
    work.comments.map((comment) => ({ id: work.id, parts: splitLinks(comment) })),
  );

  test('URL をむき出しで書かず、[label](url) で書く', () => {
    const bare = comments.filter(({ parts }) =>
      /https?:\/\/|\(\/|\]\(/.test(parts.map((p) => ('text' in p ? p.text : '')).join('')),
    );
    assert.deepEqual(
      bare.map((c) => c.id),
      [],
    );
  });

  test('サイト内へのリンクは、どれも実在するページを指す', () => {
    const paths = new Set(sitePaths(works));
    const broken = comments.flatMap(({ id, parts }) =>
      parts
        .filter((p) => 'href' in p && p.href.startsWith('/') && !paths.has(p.href))
        .map((p) => `${id}: ${p.href}`),
    );
    assert.deepEqual(broken, []);
  });
});
