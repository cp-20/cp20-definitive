// Figures and code names in the history's lines are marked in the text itself.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { splitEmphasis } from './emphasis.ts';

describe('splitEmphasis', () => {
  test('**数字** と `名前` を、前後の文と分ける', () => {
    assert.deepEqual(splitEmphasis('チーム「`[object Object]`」で **211,213 点**。'), [
      { text: 'チーム「' },
      { code: '[object Object]' },
      { text: '」で ' },
      { strong: '211,213 点' },
      { text: '。' },
    ]);
  });

  test('印のない文はそのまま', () => {
    assert.deepEqual(splitEmphasis('約10日間 * 2'), [{ text: '約10日間 * 2' }]);
  });
});
