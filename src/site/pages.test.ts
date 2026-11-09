// The page list and what is derived from it: paths, page keys, tabs and the works' checks.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import {
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
} from './pages.ts';

describe('validateWorks', () => {
  for (const id of ['Foo', 'a--b', '', 'a.b', '-a', 'a-', 'a/b', undefined])
    test(`作品 id ${JSON.stringify(id)} は使えない`, () => {
      assert.throws(() => validateWorks([{ id } as { id: string }]), /Invalid work id/);
    });

  test('同じ id の作品が2つあれば失敗にする', () => {
    assert.throws(() => validateWorks([{ id: 'a' }, { id: 'a' }]), /Duplicate work id "a"/);
  });
});

describe('mergeWorks', () => {
  test('手で足した作品が既存の id と重なれば失敗にする', () => {
    assert.throws(() => mergeWorks([{ id: 'a' }], { projects: [{ id: 'a' }] }), /Duplicate work id "a"/);
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

  for (const [path, tab, section] of [
    ['/', 0, 'home'],
    ['/works', 1, 'works'],
    ['/works/x', 1, 'works'],
    ['/articles', 2, 'articles'],
    ['/about', 3, 'about'],
    ['/404', -1, '404'],
  ] as const)
    test(`${path} はタブ ${tab}、セクション ${section}`, () => {
      assert.deepEqual([tabIndex(path), sectionName(path)], [tab, section]);
    });
});

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
