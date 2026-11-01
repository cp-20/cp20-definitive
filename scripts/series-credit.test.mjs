// A manga with an original author keeps every credit on the /about shelf.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spineAuthor } from '../src/data/series-credit.mjs';

const about = new URL('../dist/client/about/index.html', import.meta.url);
const skip = !existsSync(about) && 'run `npm run build` first';
const credit = '柳ゆうと (原作：もちもち物質 キャラクター原案：ペペロン)';

test('背表紙には最初の名前だけを書く', () => {
  assert.equal(spineAuthor(credit), '柳ゆうと');
});

test('名前がひとつなら、そのまま背表紙に書く', () => {
  assert.equal(spineAuthor('松田舞'), '松田舞');
});

test.skipIf(skip)('棚の本の名前には、原作・原案まで含めた全員を書く', () => {
  assert.ok(readFileSync(about, 'utf8').includes(`aria-label="没落令嬢の悪党賛歌 ${credit}"`));
});

test.skipIf(skip)('棚の背表紙には、最初の名前だけを書く', () => {
  assert.ok(readFileSync(about, 'utf8').includes('<small>柳ゆうと</small>'));
});
