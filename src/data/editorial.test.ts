// The history on /about: its entries are addressable (/about#<id>), and every figure shown in a
// line or in the speed-up strip is one its dialog's write-up states.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import baseWorks from './works.json' with { type: 'json' };
import manual from './manual.json' with { type: 'json' };
import { milestones, speedups } from './editorial.ts';
import { splitEmphasis } from '../content/emphasis.ts';
import { mergeWorks } from '../site/pages.ts';

// Units written two ways (17.5 秒 / 17.5秒, 35ms / 35ミリ秒) compare as the same.
const normalize = (s: string) => s.replace(/\s+/g, '').replace(/ミリ秒/g, 'ms');
const detailOf = (id: string) => normalize(milestones.find((m) => m.id === id)!.detail.join(''));

describe('経歴', () => {
  test('id は重複せず、URL の # にそのまま書ける形', () => {
    const ids = milestones.map((m) => m.id);
    assert.deepEqual(
      ids.filter((id, i) => ids.indexOf(id) !== i || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id)),
      [],
    );
  });

  test('作品へのリンクは、ある作品を指す', () => {
    const works = new Set(mergeWorks(baseWorks, manual).map((w) => w.id));
    assert.deepEqual(
      milestones.filter((m) => m.work && !works.has(m.work)).map((m) => m.id),
      [],
    );
  });

  for (const m of milestones)
    test(`「${m.title}」の1行で強調した数字は、詳しい説明にも書いてある`, () => {
      const figures = splitEmphasis(m.text).flatMap((p) =>
        'strong' in p ? (p.strong.match(/[\d,.]+/g) ?? []) : [],
      );
      assert.deepEqual(
        figures.filter((f) => !detailOf(m.id).includes(f)),
        [],
      );
    });
});

describe('速くしてきたもの', () => {
  test('5件', () => {
    assert.equal(speedups.length, 5);
  });

  for (const s of speedups)
    test(`${s.place} の ${s.from ? `${s.from}→` : ''}${s.to} は、その経歴の説明に書いてある`, () => {
      assert.deepEqual(
        [s.from, s.to].filter((v) => v && !detailOf(s.id).includes(normalize(v))),
        [],
      );
    });
});
