import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { decodeNonAsciiReferences } from './html.ts';

describe('decodeNonAsciiReferences', () => {
  test('本文と属性の日本語の文字参照を文字に戻す', () => {
    assert.equal(
      decodeNonAsciiReferences('<p title="&#12375;&#x30fc;">&#12375;&#12540;&#12404;&#12540;</p>'),
      '<p title="しー">しーぴー</p>',
    );
  });
  test('ASCII と C1 制御文字の参照、script と style の中身はそのまま', () => {
    const html =
      '<p>&#60;a&#62; &#38; &#128;</p><script>x="&#12375;"</script><style>a::after{content:"&#12375;"}</style>&#12375;';
    assert.equal(
      decodeNonAsciiReferences(html),
      '<p>&#60;a&#62; &#38; &#128;</p><script>x="&#12375;"</script><style>a::after{content:"&#12375;"}</style>し',
    );
  });
});
