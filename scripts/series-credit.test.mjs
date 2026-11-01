// A manga with an original author keeps every credit on the /about shelf.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spineAuthor } from '../src/data/series-credit.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('the spine shows the first name; the full credit stays in the data', async () => {
  assert.equal(spineAuthor('柳ゆうと (原作：もちもち物質 キャラクター原案：ペペロン)'), '柳ゆうと');
  assert.equal(spineAuthor('松田舞'), '松田舞');
  const series = JSON.parse(await read('src/data/series.json'));
  const credited = series.find((s) => s.title === '没落令嬢の悪党賛歌');
  assert.match(credited.author, /原作：もちもち物質/);
  assert.match(credited.author, /キャラクター原案：ペペロン/);
});

test('the caption and the book label use the full credit, only the spine is shortened', async () => {
  const pages = await read('src/pages.tsx');
  const shelf = pages.slice(
    pages.indexOf('function Bookshelf'),
    pages.indexOf('export function ArticleRows'),
  );
  assert.match(shelf, /<small>\{spineAuthor\(s\.author\)\}<\/small>/);
  assert.match(shelf, /<span>\{s\.author\}<\/span>/);
  assert.match(shelf, /aria-label=\{`\$\{s\.title\} \$\{s\.author\}`\}/);
});
