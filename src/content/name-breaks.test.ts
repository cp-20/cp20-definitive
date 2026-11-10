// Repository names wrap between words, not in the middle of one.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { nameParts } from './name-breaks.ts';

for (const [name, parts, where] of [
  ['zundamon-explainer_v2.cp20/dev', ['zundamon-', 'explainer_', 'v2.', 'cp20/', 'dev'], '- _ . / のあと'],
  ['KotonohaCollector', ['Kotonoha', 'Collector'], 'PascalCase の単語の間'],
  [
    'traQ-clickup-notifier',
    ['traQ-', 'clickup-', 'notifier'],
    '区切り文字のあと（途中の大文字では切らない）',
  ],
  ['traQing', ['traQing'], 'どこでもない（小文字で始まる名前の途中の大文字では切らない）'],
  ['awoo', ['awoo'], 'どこでもない（区切りのない名前）'],
  ['a-', ['a-'], '末尾の区切り文字のあとではない（空の部分を作らない）'],
] as [string, string[], string][])
  test(`${name} は${where}で折り返せる`, () => {
    assert.deepEqual(nameParts(name), parts);
  });
