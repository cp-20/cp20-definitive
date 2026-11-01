// The page list and what is derived from it: page keys, tabs and the stamp database rules.
import { test } from 'node:test';
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

test('database.rules.json is generated from the page list', async () => {
  const committed = await readFile(new URL('../database.rules.json', import.meta.url), 'utf8');
  assert.equal(committed, await generatedRules(), 'run npm run rules');
});

test('the page pattern takes every page and nothing else', () => {
  const pattern = pagePattern(buildRules(stampPageKeys(works)));
  for (const key of stampPageKeys(works)) assert.match(key, pattern);
  for (const key of ['works--nope', 'home--x', 'works--', 'homes', '', 'xhome', 'works--c-compiler-x'])
    assert.doesNotMatch(key, pattern, key);
  // A new work's page is accepted once the rules are regenerated.
  const added = pagePattern(buildRules(stampPageKeys([...works, { id: 'new-thing' }])));
  assert.match('works--new-thing', added);
  assert.doesNotMatch('works--new-thing', pattern);
  assert.throws(() => buildRules(['home', 'a|b']));
});

test('work ids are checked', () => {
  assert.ok(works.length >= 18);
  assert.deepEqual(validateWorks(works), works);
  for (const id of ['Foo', 'a--b', '', 'a.b', '-a', 'a-', 'a/b', undefined])
    assert.throws(() => validateWorks([{ id }]), /Invalid work id/, String(id));
  assert.throws(() => validateWorks([{ id: 'a' }, { id: 'a' }]), /Duplicate work id "a"/);
  assert.throws(
    () => validateWorks([{ id: 'a', imageKind: 'square' }]),
    /Invalid imageKind "square" for work "a"/,
  );
  assert.deepEqual(validateWorks([{ id: 'a', imageKind: 'icon' }]), [{ id: 'a', imageKind: 'icon' }]);
  assert.throws(() => mergeWorks(baseWorks, { projects: [{ id: baseWorks[0].id }] }), /Duplicate/);
  assert.deepEqual(mergeWorks([{ id: 'a' }], {}), [{ id: 'a' }]);
});

test('paths, page keys, tabs and sections', () => {
  for (const { id } of works) assert.equal(pageKey(workPath(id)), `works--${id}`);
  assert.deepEqual(stampPageKeys([]), ['home', 'about', 'articles', 'works']);
  assert.deepEqual(sitePaths([{ id: 'x' }]), ['/', '/about', '/articles', '/works', '/works/x']);
  for (const [input, output] of [
    ['/works/', '/works'],
    ['/', '/'],
    ['', '/'],
    ['/about', '/about'],
  ])
    assert.equal(normalizePath(input), output);
  assert.deepEqual(TAB_PATHS, ['/', '/works', '/articles', '/about']);
  for (const [path, tab, section] of [
    ['/', 0, 'home'],
    ['/works', 1, 'works'],
    ['/works/x', 1, 'works'],
    ['/articles', 2, 'articles'],
    ['/about', 3, 'about'],
    ['/404', -1, '404'],
    ['/colophon', -1, 'colophon'],
  ]) {
    assert.equal(tabIndex(path), tab, path);
    assert.equal(sectionName(path), section, path);
  }
});

test(
  'every related article of a work is in the article list, so it shows with its title',
  // The scheduled refresh only warns here (see refresh.yml); commits and PRs stay strict.
  { skip: process.env.RELATED_ARTICLES === 'warn' && 'related-article check set to warn' },
  () => {
    const articles = mergeArticles(snapshot.articles, [], manual);
    assertRelatedArticles(works, articles);
    // The C compiler write-up is the main explanation of a headline work.
    assert.equal(
      articles.find((a) => a.url === 'https://trap.jp/post/2313/')?.title,
      'Cコンパイラを作ろうとしてみた',
    );
  },
);

test('a missing related article is reported with its work, and assert throws on it', () => {
  const articles = [{ url: 'https://example.com/known' }];
  const linked = [{ id: 'a', relatedArticles: ['https://example.com/known', 'https://example.com/x'] }];
  assert.deepEqual(missingRelatedArticles(linked, articles), [
    'Work "a" links https://example.com/x, which is not in the article list',
  ]);
  assert.throws(() => assertRelatedArticles(linked, articles), /Work "a" links https:\/\/example\.com\/x/);
  assert.deepEqual(missingRelatedArticles([{ id: 'a' }], []), []);
  assertRelatedArticles([{ id: 'a' }], []);
});
