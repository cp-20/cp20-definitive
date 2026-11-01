// The page list and what is derived from it: page keys, tabs and the stamp database rules.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  TAB_PATHS,
  assertRelatedArticles,
  missingRelatedArticles,
  mergeWorks,
  normalizePath,
  pageKey,
  sectionName,
  sitePaths,
  stampPageKeys,
  tabIndex,
  validateWorks,
  workPath,
} from '../src/data/site-pages.mjs';
import { buildRules, generatedRules } from './database-rules.mjs';
import { mergeArticles } from '../src/data/normalize.mjs';

const load = async (name) =>
  JSON.parse(await readFile(new URL(`../src/data/${name}.json`, import.meta.url), 'utf8'));
const [baseWorks, manual, snapshot] = await Promise.all([load('works'), load('manual'), load('generated')]);
const works = mergeWorks(baseWorks, manual);
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

describe('validateWorks', () => {
  test('コミットされた作品はすべて通る', () => {
    assert.deepEqual(validateWorks(works), works);
  });

  for (const id of ['Foo', 'a--b', '', 'a.b', '-a', 'a-', 'a/b', undefined])
    test(`作品 id ${JSON.stringify(id)} は使えない`, () => {
      assert.throws(() => validateWorks([{ id }]), /Invalid work id/);
    });

  test('同じ id の作品が2つあれば失敗にする', () => {
    assert.throws(() => validateWorks([{ id: 'a' }, { id: 'a' }]), /Duplicate work id "a"/);
  });

  test('imageKind は icon だけを受け付ける', () => {
    assert.throws(
      () => validateWorks([{ id: 'a', imageKind: 'square' }]),
      /Invalid imageKind "square" for work "a"/,
    );
  });
});

describe('mergeWorks', () => {
  test('手で足した作品が既存の id と重なれば失敗にする', () => {
    assert.throws(() => mergeWorks(baseWorks, { projects: [{ id: baseWorks[0].id }] }), /Duplicate/);
  });

  test('手で足した作品がなければ、そのまま', () => {
    assert.deepEqual(mergeWorks([{ id: 'a' }], {}), [{ id: 'a' }]);
  });
});

describe('パスとページキー', () => {
  test('作品ページのキーは works--<id>', () => {
    assert.equal(pageKey(workPath('c-compiler')), 'works--c-compiler');
  });

  test('作品がなくても、固定の4ページにシールを貼れる', () => {
    assert.deepEqual(stampPageKeys([]), ['home', 'about', 'articles', 'works']);
  });

  test('サイトのパスは固定の4ページと作品ページ', () => {
    assert.deepEqual(sitePaths([{ id: 'x' }]), ['/', '/about', '/articles', '/works', '/works/x']);
  });

  for (const [input, output] of [
    ['/works/', '/works'],
    ['/', '/'],
    ['', '/'],
    ['/about', '/about'],
  ])
    test(`${JSON.stringify(input)} は ${output} にそろえる`, () => {
      assert.equal(normalizePath(input), output);
    });

  test('タブは ホーム・作品・記事・プロフィール の順', () => {
    assert.deepEqual(TAB_PATHS, ['/', '/works', '/articles', '/about']);
  });

  for (const [path, tab, section] of [
    ['/', 0, 'home'],
    ['/works', 1, 'works'],
    ['/works/x', 1, 'works'],
    ['/articles', 2, 'articles'],
    ['/about', 3, 'about'],
    ['/404', -1, '404'],
    ['/colophon', -1, 'colophon'],
  ])
    test(`${path} はタブ ${tab}、セクション ${section}`, () => {
      assert.deepEqual([tabIndex(path), sectionName(path)], [tab, section]);
    });
});

// The scheduled refresh only warns here (see refresh.yml); commits and PRs stay strict.
test.skipIf(process.env.RELATED_ARTICLES === 'warn' && 'related-article check set to warn')(
  '作品の関連記事は、どれも記事一覧にある（記事名つきで表示できる）',
  () => {
    assert.deepEqual(missingRelatedArticles(works, mergeArticles(snapshot.articles, [], manual)), []);
  },
);

describe('missingRelatedArticles', () => {
  const articles = [{ url: 'https://example.com/known' }];
  const linked = [{ id: 'a', relatedArticles: ['https://example.com/known', 'https://example.com/x'] }];

  test('一覧にない関連記事を、作品名つきで挙げる', () => {
    assert.deepEqual(missingRelatedArticles(linked, articles), [
      'Work "a" links https://example.com/x, which is not in the article list',
    ]);
  });

  test('assertRelatedArticles は、一覧にない関連記事があれば失敗にする', () => {
    assert.throws(() => assertRelatedArticles(linked, articles), /Work "a" links https:\/\/example\.com\/x/);
  });

  test('関連記事のない作品では何も挙げない', () => {
    assert.deepEqual(missingRelatedArticles([{ id: 'a' }], []), []);
  });
});
