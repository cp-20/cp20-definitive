// Links written inside work descriptions are rendered as links, not as bare URLs. The works'
// own descriptions are checked in src/data/snapshot.test.ts.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { splitLinks } from './inline-links.ts';

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
