// Figures in the history's lines are marked in the text itself.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { splitEmphasis } from './emphasis.ts';

describe('splitEmphasis', () => {
  test('**数字** を、前後の文と分ける', () => {
    assert.deepEqual(splitEmphasis('チーム [object Object] で **211,213 点**、**学生2位**。'), [
      { text: 'チーム [object Object] で ' },
      { strong: '211,213 点' },
      { text: '、' },
      { strong: '学生2位' },
      { text: '。' },
    ]);
  });

  test('印のない文はそのまま', () => {
    assert.deepEqual(splitEmphasis('約10日間 * 2'), [{ text: '約10日間 * 2' }]);
  });
});
