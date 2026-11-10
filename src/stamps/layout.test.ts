// Where placed stickers are drawn on the page.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import {
  MENU_WIDTH,
  STICKER_RADIUS,
  layoutStamps,
  menuSpot,
  spotIn,
  stampAt,
  visualKey,
  type Box,
} from './layout.ts';
import type { PlacedStamp } from './types.ts';

const stamp = (id: string, fields: Partial<PlacedStamp> = {}): PlacedStamp => ({
  id,
  owner: 'me',
  slot: '0',
  anchor: 'intro',
  x: 0.5,
  y: 0.25,
  kind: 0,
  angle: 0,
  createdAt: 1,
  ...fields,
});
// The page is 1000px wide from x = 100; the intro section is 400×200 at (200, 300).
const boxes: Record<string, Box> = {
  page: { x: 100, y: 0, w: 1000, h: 3000 },
  intro: { x: 200, y: 300, w: 400, h: 200 },
};
const boxOf = (name: string) => boxes[name] ?? null;

describe('spotIn', () => {
  test('箱の中の点は、箱に対する割合になる', () => {
    assert.deepEqual(spotIn({ x: 200, y: 300, w: 400, h: 200 }, 300, 350), { x: 0.25, y: 0.25 });
  });

  for (const [where, px, py] of [
    ['左', 199, 350],
    ['右', 601, 350],
    ['上', 300, 299],
    ['下', 300, 501],
  ] as const)
    test(`箱の${where}の外の点は null`, () => {
      assert.equal(spotIn({ x: 200, y: 300, w: 400, h: 200 }, px, py), null);
    });

  test('箱の縁の上の点は、箱の中として扱う', () => {
    assert.deepEqual(spotIn({ x: 200, y: 300, w: 400, h: 200 }, 600, 500), { x: 1, y: 1 });
  });
});

describe('layoutStamps', () => {
  test('アンカーの箱の中の割合から、ページ上の座標を求める', () => {
    const [shown] = layoutStamps([stamp('a')], boxOf).values();
    assert.deepEqual([shown.left, shown.top], [400, 350]);
  });

  test('シールがなければ何も測らない（プリレンダー中は測るページがない）', () => {
    const measured: string[] = [];
    layoutStamps([], (name) => (measured.push(name), boxOf(name)));
    assert.deepEqual(measured, []);
  });

  test('表示されていないアンカーのシールは描かない', () => {
    assert.equal(layoutStamps([stamp('a', { anchor: 'gone' })], boxOf).size, 0);
  });

  test('ページの右端にはみ出すシールは、見出しタブにかからないよう内側に寄せる', () => {
    const [shown] = layoutStamps([stamp('a', { anchor: 'page', x: 1 })], boxOf).values();
    assert.equal(shown.left, 100 + 1000 - STICKER_RADIUS - 8);
  });

  test('見た目と位置が同じシールは1枚として描く', () => {
    assert.equal(layoutStamps([stamp('a'), stamp('b')], boxOf).size, 1);
  });

  test('変わっていないシールは、前回と同じオブジェクトを使い回す', () => {
    const before = layoutStamps([stamp('a')], boxOf);
    const after = layoutStamps([stamp('a')], boxOf, before);
    assert.equal(after.get(visualKey(stamp('a'))), before.get(visualKey(stamp('a'))));
  });

  test('箱が動いたシールは、前回のオブジェクトを使い回さず新しい座標で描く', () => {
    const before = layoutStamps([stamp('a')], boxOf);
    const moved = (name: string) => (name === 'intro' ? { ...boxes.intro, x: 250 } : boxOf(name));
    const after = layoutStamps([stamp('a')], moved, before);
    assert.equal(after.get(visualKey(stamp('a')))?.left, 450);
  });

  test('持ち主のアバターが変わったシールは、新しいオブジェクトにする', () => {
    const before = layoutStamps([stamp('a')], boxOf);
    const after = layoutStamps([stamp('a', { avatar: 'ab'.repeat(32) })], boxOf, before);
    assert.equal(after.get(visualKey(stamp('a')))?.avatar, 'ab'.repeat(32));
  });

  test('保存されて id が変わったシールは、新しいオブジェクトにする', () => {
    const before = layoutStamps([stamp('local-1', { owner: 'local' })], boxOf);
    const after = layoutStamps([stamp('me-0')], boxOf, before);
    assert.equal(after.get(visualKey(stamp('me-0')))?.id, 'me-0');
  });
});

describe('stampAt', () => {
  const shown = [
    { ...stamp('below'), key: 'below', left: 100, top: 100 },
    { ...stamp('above'), key: 'above', left: 110, top: 100 },
  ];
  const any = () => true;

  test('重なっていれば、上に描かれたシールを返す', () => {
    assert.equal(stampAt(shown, 105, 100, any)?.id, 'above');
  });

  test('条件に合うシールだけを探す', () => {
    assert.equal(stampAt(shown, 105, 100, (s) => s.id === 'below')?.id, 'below');
  });

  test('ちょうどシールの半径の距離の点では見つかる', () => {
    assert.equal(stampAt(shown, 100, 100 + STICKER_RADIUS, (s) => s.id === 'below')?.id, 'below');
  });

  test('シールの半径より遠い点では見つからない', () => {
    assert.equal(
      stampAt(shown, 100, 100 + STICKER_RADIUS + 1, (s) => s.id === 'below'),
      undefined,
    );
  });
});

describe('menuSpot', () => {
  const box = (left: number, top: number) => ({ left, top, right: left + 46, bottom: top + 46 });
  test('シールの真上、少し離れたところに出る', () => {
    assert.deepEqual(menuSpot(box(200, 300), 390), { x: 223, y: 292, below: false });
  });
  test('上に場所がなければ下に出る', () => {
    assert.deepEqual(menuSpot(box(200, 20), 390), { x: 223, y: 74, below: true });
  });
  test('画面の端からはみ出さない', () => {
    assert.equal(menuSpot(box(0, 300), 390).x, MENU_WIDTH / 2 + 8);
    assert.equal(menuSpot(box(344, 300), 390).x, 390 - MENU_WIDTH / 2 - 8);
  });
});
