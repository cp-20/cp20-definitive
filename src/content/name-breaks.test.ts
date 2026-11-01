// Repository names wrap between words, not in the middle of one.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { repos } from '../data/generated.json' with { type: 'json' };
import { nameParts } from './name-breaks.ts';

for (const [name, parts, why] of [
  ['zundamon-explainer', ['zundamon-', 'explainer'], 'ハイフンのあと'],
  ['veryl_cpu', ['veryl_', 'cpu'], 'アンダースコアのあと'],
  ['2026.cp20.dev', ['2026.', 'cp20.', 'dev'], 'ドットのあと'],
  ['KotonohaCollector', ['Kotonoha', 'Collector'], 'PascalCase の単語の間'],
  [
    'traQ-clickup-notifier',
    ['traQ-', 'clickup-', 'notifier'],
    '区切り文字のあと（途中の大文字では切らない）',
  ],
  ['traQing', ['traQing'], '小文字で始まる名前の途中の大文字では切らない'],
  ['awoo', ['awoo'], '区切りのない名前は切らない'],
  ['a-', ['a-'], '末尾の区切り文字で空の部分を作らない'],
] as [string, string[], string][])
  test(`${name} は${why}で折り返せる`, () => {
    assert.deepEqual(nameParts(name), parts);
  });

test('一覧のどのリポジトリ名も、切った部分をつなぐと元に戻り、空の部分がない', () => {
  const broken = repos
    .map((r) => r.name)
    .filter((name) => nameParts(name).join('') !== name || !nameParts(name).every(Boolean));
  assert.deepEqual(broken, []);
});
