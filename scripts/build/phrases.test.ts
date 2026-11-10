// The phrase marks that let Japanese sentences break between phrases on every browser.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { BREAK, plain } from '../../src/content/phrase-marks.ts';
import { phraseWorks, phrased } from './phrases.ts';

const shown = (text: string) => text.replaceAll(BREAK, '|');

test('文節の境目に印を入れ、印を外すと元の文に戻る', () => {
  const text = '自作Cコンパイラのビルドを速くした';
  assert.equal(shown(phrased(text)), '自作Cコンパイラの|ビルドを|速くした');
  assert.equal(plain(phrased(text)), text);
});

test('空白の隣には印を入れず、印の入った文に入れ直しても同じ', () => {
  assert.equal(shown(phrased('traP の Hackathon で 3 位')), 'traP の Hackathon で 3 位');
  assert.equal(phrased(phrased('すでに分かれた文')), phrased('すでに分かれた文'));
});

test('作品は、ページに文として出す欄だけに印を入れる', () => {
  const [work] = phraseWorks([
    { title: 'ビルドを速くした', description: 'ビルドを速くした', alt: 'ビルドを速くした' },
  ]);
  assert.deepEqual(
    [work.title, shown(work.description), work.alt],
    ['ビルドを速くした', 'ビルドを|速くした', 'ビルドを速くした'],
  );
});
