// Links written inside work descriptions are rendered as links, not as bare URLs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { splitLinks } from '../src/data/inline-links.mjs';
import { mergeWorks, sitePaths } from '../src/data/site-pages.mjs';

const load = async (name) =>
  JSON.parse(await readFile(new URL(`../src/data/${name}.json`, import.meta.url), 'utf8'));

test('splitLinks separates text and [label](href) links', () => {
  assert.deepEqual(splitLinks('前に[ブログ](https://example.com/a)を、[去年](/works/x)も'), [
    { text: '前に' },
    { label: 'ブログ', href: 'https://example.com/a' },
    { text: 'を、' },
    { label: '去年', href: '/works/x' },
    { text: 'も' },
  ]);
  assert.deepEqual(splitLinks('リンクなし (@yui540 さん)'), [{ text: 'リンクなし (@yui540 さん)' }]);
  // Only http(s) and site paths become links.
  assert.deepEqual(splitLinks('[x](javascript:alert(1))'), [{ text: '[x](javascript:alert(1))' }]);
});

test('work descriptions have no bare URLs and internal links point to existing pages', async () => {
  const works = mergeWorks(await load('works'), await load('manual'));
  const paths = new Set(sitePaths(works));
  for (const work of works) {
    for (const comment of work.comments) {
      const text = splitLinks(comment)
        .map((p) => ('text' in p ? p.text : ''))
        .join('');
      assert.doesNotMatch(
        text,
        /https?:\/\/|\(\/|\]\(/,
        `${work.id}: write links as [label](url): ${comment}`,
      );
      for (const part of splitLinks(comment)) {
        if ('href' in part && part.href.startsWith('/'))
          assert.ok(paths.has(part.href), `${work.id}: ${part.href} is not a page`);
      }
    }
  }
});
