// Articles as the site stores them: checked URLs and titles, merged with the editor's changes.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { article, mergeArticles, safeUrl, stripInvalidText, type Article } from './normalize.ts';

const old: Article = {
  title: 'Old',
  url: 'https://zenn.dev/cp20/articles/a',
  source: 'zenn.dev',
  date: '2024-01-01T00:00:00.000Z',
};
const noManual = { articles: [], exclude: [], overrides: {} };
const note = article('A & B', 'https://note.com/cp20/n/a', 'Tue, 01 Sep 2026 00:00:00 GMT', 'note.com');

test('javascript: の URL は受け付けない', () => {
  assert.throws(() => safeUrl('javascript:alert(1)'));
});

test('URL から追跡用のクエリとハッシュを落とし、ほかのクエリは残す', () => {
  assert.equal(
    safeUrl('https://zenn.dev/a?utm_source=x&utm_medium=y&utm_campaign=z&ref=r&page=2#top'),
    'https://zenn.dev/a?page=2',
  );
});

test('www. の有無は同じ掲載先として受け付ける', () => {
  assert.equal(
    article('x', 'https://www.zenn.dev/a', '2026-01-01', 'zenn.dev').url,
    'https://www.zenn.dev/a',
  );
});

test('掲載先とホストの違う URL の記事は受け付けない', () => {
  assert.throws(() => article('x', 'https://evil.example/a', '2026-01-01', 'zenn.dev'), /host/);
});

describe('mergeArticles', () => {
  test('編集者の上書きは、取得した記事名より優先する', () => {
    const manual = { ...noManual, overrides: { [old.url]: { title: 'editor' } } };
    assert.equal(mergeArticles([old], [{ ...old, title: 'new' }], manual)[0].title, 'editor');
  });

  test('過去の記事と新しく取得した記事を、同じ URL は新しいほうを1件にして、新しい順に並べる', () => {
    const renamed = { ...old, title: 'Renamed', url: `${old.url}?utm_source=x#top` };
    assert.deepEqual(
      mergeArticles([old], [note, renamed]).map((a) => [a.title, a.url]),
      [
        ['A & B', note.url],
        ['Renamed', old.url],
      ],
    );
  });

  test('除外した記事は載せない', () => {
    assert.deepEqual(mergeArticles([old], [], { ...noManual, exclude: [old.url] }), []);
  });
});

describe('XML に使えない文字', () => {
  test('記事名から取り除く', () => {
    assert.equal(
      article('a\u0007b\u0000￾', 'https://zenn.dev/cp20/articles/1', '2026-01-01', 'zenn.dev').title,
      'ab',
    );
  });

  test('対になっていないサロゲートを取り除き、絵文字やタブ・改行は残す', () => {
    assert.equal(stripInvalidText('x\uD800y\uDC00z😀\t\n'), 'xyz😀\t\n');
  });

  test('取り除いて空になる記事名は失敗にする', () => {
    assert.throws(() =>
      article('\u0001\u0002', 'https://zenn.dev/cp20/articles/1', '2026-01-01', 'zenn.dev'),
    );
  });
});
