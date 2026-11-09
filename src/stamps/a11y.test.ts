// What the sticker sheet says out loud, and where keyboard focus goes.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { focusAfterRemoval, signInMessage, stampAnnouncement, stampPlace } from './a11y.ts';

describe('stampPlace', () => {
  for (const [anchor, label, expected] of [
    ['history', ' 経歴\n', '経歴の上'],
    ['page', 'ページの見出しは使わない', 'ページの余白の上'],
    ['work-image', '', '作品の画像の上'],
    ['constructor', '', 'ページの上'],
  ])
    test(`${anchor}（見出し「${label.trim()}」）は「${expected}」`, () => {
      assert.equal(stampPlace(anchor, label), expected);
    });

  test('長い見出しは40文字に切り詰める', () => {
    assert.equal(stampPlace('article-x', 'あ'.repeat(80)), `${'あ'.repeat(39)}…の上`);
  });
});

// The sentences as a screen reader says them.
describe('stampAnnouncement', () => {
  test('貼ったら、貼った場所と残りの枚数を伝える', () => {
    assert.equal(
      stampAnnouncement('placed', 'いいね', 4, undefined, 'traP Missionの上'),
      'いいねをtraP Missionの上に貼りました。残り4枚',
    );
  });

  test('押し出したシールがあれば、残りの代わりにそれを伝える', () => {
    assert.equal(
      stampAnnouncement('placed', 'ハート', 0, 'クローバー', '経歴の上'),
      'ハートを経歴の上に貼りました。一番古いクローバーをはがしました',
    );
  });

  test('残りの枚数が負なら、0枚と伝える', () => {
    assert.equal(stampAnnouncement('removed', 'ハート', -1), 'ハートをはがしました。残り0枚');
  });
});

describe('focusAfterRemoval', () => {
  test('消えたボタンの次へ移る', () => {
    assert.equal(focusAfterRemoval(['a', 'b', 'c'], 'b'), 'c');
  });

  test('最後のボタンが消えたら、ひとつ前へ移る', () => {
    assert.equal(focusAfterRemoval(['a', 'b', 'c'], 'c'), 'b');
  });

  test('ほかにボタンがないときや、一覧にないボタンからは移らない', () => {
    assert.deepEqual([focusAfterRemoval(['a'], 'a'), focusAfterRemoval(['a'], 'x')], [undefined, undefined]);
  });
});

describe('signInMessage', () => {
  for (const [why, code, expected] of [
    ['ポップアップを自分で閉じたら、何も言わない', 'auth/popup-closed-by-user', ''],
    ['ポップアップを開き直したら、何も言わない', 'auth/cancelled-popup-request', ''],
    ['時間切れなら、もう一度押すよう促す', 'timeout', '接続できませんでした。もう一度押してください'],
    ['コードのない失敗は、ログインできなかったと伝える', undefined, 'ログインできませんでした'],
  ] as [string, string | undefined, string][])
    test(why, () => {
      assert.equal(signInMessage(code), expected);
    });
});
