// database.rules.json, generated from the page list.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mergeWorks, stampPageKeys } from '../src/site/pages.ts';
import { buildRules, generatedRules } from './database-rules.mjs';

const load = async (name) =>
  JSON.parse(await readFile(new URL(`../src/data/${name}.json`, import.meta.url), 'utf8'));
const works = mergeWorks(await load('works'), await load('manual'));
const pagePattern = (rules) =>
  new RegExp(rules.rules.pages.$page['.validate'].match(/matches\(\/(.*)\/\)$/)[1]);

test('database.rules.json はページ一覧から生成したものと一致する（npm run rules）', async () => {
  const committed = await readFile(new URL('../database.rules.json', import.meta.url), 'utf8');
  assert.equal(committed, await generatedRules());
});

describe('ルールのページの正規表現', () => {
  const pattern = pagePattern(buildRules(stampPageKeys(works)));

  test('サイトのすべてのページを受け付ける', () => {
    assert.deepEqual(
      stampPageKeys(works).filter((key) => !pattern.test(key)),
      [],
    );
  });

  for (const key of ['works--nope', 'home--x', 'works--', 'homes', '', 'xhome', 'works--c-compiler-x'])
    test(`サイトにないページ ${JSON.stringify(key)} は受け付けない`, () => {
      assert.doesNotMatch(key, pattern);
    });

  test('作品を足してルールを作り直すと、そのページを受け付ける', () => {
    const added = pagePattern(buildRules(stampPageKeys([...works, { id: 'new-thing' }])));
    assert.deepEqual([pattern.test('works--new-thing'), added.test('works--new-thing')], [false, true]);
  });

  test('正規表現を壊すページキーではルールを作らない', () => {
    assert.throws(() => buildRules(['home', 'a|b']));
  });
});
