// A visitor's sticker record and the edits behind placing, moving and peeling.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  moveIn,
  nextRecord,
  placeIn,
  recordStamps,
  removeFrom,
  stampEntries,
} from '../src/data/stamp-record.mjs';

const TS = { '.sv': 'timestamp' };
const sticker = (fields = {}) => ({
  anchor: 'intro',
  x: 0.5,
  y: 0.5,
  kind: 0,
  angle: 0,
  createdAt: 1,
  ...fields,
});
// Five stickers in slots 0…4, the one in slot 0 the oldest.
const fullRecord = () => ({
  updatedAt: 9,
  stamps: Object.fromEntries(
    [0, 1, 2, 3, 4].map((i) => [String(i), sticker({ x: i / 10, createdAt: 10 + i })]),
  ),
});
// A stored sticker as the page saw it.
const seen = (record, slot) => ({ ...record.stamps[slot], slot, id: `me-${slot}`, owner: 'me' });

describe('stampEntries', () => {
  test('配列で届いた穴あきのスロットも、番号つきで読める', () => {
    assert.deepEqual(stampEntries({ stamps: [null, sticker(), null] }), [['1', sticker()]]);
  });

  test('レコードがなければ空', () => {
    assert.deepEqual(stampEntries(null), []);
  });

  for (const [name, fields] of [
    ['priority つきの x', { x: { '.value': 0.5, '.priority': 'p' } }],
    ['priority つきの kind', { kind: { '.value': 0, '.priority': 'p' } }],
    ['未解決のサーバー時刻', { createdAt: TS }],
    ['整数でない kind', { kind: 1.5 }],
    ['範囲外の kind', { kind: 6 }],
    ['大きすぎる傾き', { angle: 21 }],
    ['使えない anchor', { anchor: 'Not An Anchor' }],
    ['NaN の y', { y: NaN }],
  ])
    test(`ルールが受け付けない値（${name}）のシールは捨てる`, () => {
      assert.deepEqual(stampEntries({ stamps: { 0: sticker(fields) } }), []);
    });

  test('スロット番号でないキーは捨てる', () => {
    assert.deepEqual(stampEntries({ stamps: { 0: sticker(), '.priority': 'junk', 7: sticker() } }), [
      ['0', sticker()],
    ]);
  });
});

describe('recordStamps', () => {
  test('持ち主とスロットから id をつける', () => {
    const [stamp] = recordStamps('alice', { stamps: { 3: sticker() } });
    assert.deepEqual([stamp.id, stamp.owner, stamp.slot], ['alice-3', 'alice', '3']);
  });

  test('Gravatar のハッシュのアバターを持たせる', () => {
    const hash = 'ab'.repeat(32);
    assert.equal(recordStamps('a', { avatar: hash, stamps: { 0: sticker() } })[0].avatar, hash);
  });

  test('Gravatar のハッシュでないアバター（URL など）は持たせない', () => {
    const avatar = 'https://evil.example/x.png';
    assert.equal(recordStamps('a', { avatar, stamps: { 0: sticker() } })[0].avatar, undefined);
  });
});

describe('placeIn', () => {
  test('空いているスロットのうち一番若い番号に貼る', () => {
    const record = { stamps: [null, sticker({ createdAt: 5 }), null] };
    assert.equal(placeIn(record, sticker(), TS).slot, '0');
  });

  test('5枚貼ってあれば一番古いシールと入れ替える', () => {
    const edit = placeIn(fullRecord(), sticker({ x: 0.9 }), TS);
    assert.deepEqual([edit.slot, edit.stamps['0'].x], ['0', 0.9]);
  });

  test('見た目と位置だけを、渡された作成時刻で保存する', () => {
    const edit = placeIn(null, { ...sticker(), id: 'x', owner: 'local', slot: '' }, TS);
    assert.deepEqual(edit.stamps['0'], { ...sticker(), createdAt: TS });
  });
});

describe('removeFrom', () => {
  test('見ていたシールのスロットを空ける', () => {
    const record = fullRecord();
    assert.deepEqual(Object.keys(removeFrom(record, seen(record, '3')).stamps), ['0', '1', '2', '4']);
  });

  test('保存済みのレコードを書き換えない', () => {
    const record = fullRecord();
    removeFrom(record, seen(record, '3'));
    assert.equal(Object.keys(record.stamps).length, 5);
  });
});

describe('moveIn', () => {
  test('自分のスロットを書き換え、ほかの4枚はそのまま残す', () => {
    const record = fullRecord();
    const edit = moveIn(record, seen(record, '3'), sticker({ x: 0.57, y: 0.01 }));
    assert.equal(edit.slot, '3');
    assert.deepEqual(
      ['0', '1', '2', '4'].map((slot) => edit.stamps[slot]),
      ['0', '1', '2', '4'].map((slot) => record.stamps[slot]),
    );
  });

  test('動かしたシールは、新しい位置と元の作成時刻で保存する', () => {
    const record = fullRecord();
    const edit = moveIn(record, seen(record, '3'), sticker({ x: 0.57 }));
    assert.deepEqual(edit.stamps['3'], sticker({ x: 0.57, createdAt: 13 }));
  });

  test('保存済みのレコードを書き換えない', () => {
    const record = fullRecord();
    moveIn(record, seen(record, '3'), sticker({ x: 0.57 }));
    assert.equal(record.stamps['3'].x, 0.3);
  });
});

describe('nextRecord', () => {
  test('変更がなければ undefined（書き込まない）', () => {
    assert.equal(nextRecord(undefined, 'hash', TS), undefined);
  });

  test('最後の1枚をはがしたらレコードごと消す（null）', () => {
    assert.equal(nextRecord({}, 'hash', TS), null);
  });

  test('シールがあれば、アバターと更新時刻を添える', () => {
    const stamps = { 0: sticker() };
    assert.deepEqual(nextRecord(stamps, 'hash', TS), { stamps, updatedAt: TS, avatar: 'hash' });
  });
});
