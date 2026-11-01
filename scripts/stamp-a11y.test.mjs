// What the sticker sheet says out loud, and where keyboard focus goes.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { focusAfterRemoval, signInMessage, stampAnnouncement, stampPlace } from '../src/data/stamp-a11y.mjs';

describe('stampPlace', () => {
  for (const [anchor, label, expected] of [
    ['history', ' 経歴\n', '経歴の上'],
    ['page', 'ページの見出しは使わない', 'ページの余白の上'],
    ['footer', '', 'フッターの上'],
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

describe('stampAnnouncement', () => {
  for (const [why, args, expected] of [
    ['貼ったら、残りの枚数を伝える', ['placed', 'ハート', 4], 'ハートを貼りました。残り4枚'],
    [
      '貼った場所がわかれば、その見出しも伝える',
      ['placed', 'いいね', 4, undefined, 'traP Missionの上'],
      'いいねをtraP Missionの上に貼りました。残り4枚',
    ],
    [
      '押し出したシールがあれば、残りの代わりにそれを伝える',
      ['placed', 'ハート', 0, 'クローバー', '経歴の上'],
      'ハートを経歴の上に貼りました。一番古いクローバーをはがしました',
    ],
    ['残りの枚数が負なら、0枚と伝える', ['placed', 'ハート', -1], 'ハートを貼りました。残り0枚'],
    ['はがしたら、残りの枚数を伝える', ['removed', 'ハート', 5], 'ハートをはがしました。残り5枚'],
    ['シール帳に戻したら、そう伝える', ['returned', 'いいね', 3], 'いいねをシール帳に戻しました'],
    [
      '持ち上げたシールを元の場所に戻したら、そう伝える',
      ['kept', 'ハート', 3],
      'ハートを元の場所に戻しました',
    ],
    [
      '貼れない場所では、シール帳に戻したと伝える',
      ['blocked', 'いいね', 3],
      'ここには貼れません。いいねをシール帳に戻しました',
    ],
    [
      '持ち上げたシールを貼れない場所に置いたら、元の場所に戻したと伝える',
      ['blocked-kept', 'ハート', 3],
      'ここには貼れません。ハートを元の場所に戻しました',
    ],
    [
      '保存できなかったら、元に戻したと伝える',
      ['failed', 'しーぴー', 0],
      '保存できませんでした。しーぴーを元に戻しました',
    ],
  ])
    test(why, () => {
      assert.equal(stampAnnouncement(...args), expected);
    });
});

describe('focusAfterRemoval', () => {
  test('消えたボタンの次へ移る', () => {
    assert.equal(focusAfterRemoval(['a', 'b', 'c'], 'b'), 'c');
  });

  test('最後のボタンが消えたら、ひとつ前へ移る', () => {
    assert.equal(focusAfterRemoval(['a', 'b', 'c'], 'c'), 'b');
  });

  test('ほかにボタンがなければ移る先はない', () => {
    assert.equal(focusAfterRemoval(['a'], 'a'), undefined);
  });

  test('一覧にないボタンからは移らない', () => {
    assert.equal(focusAfterRemoval(['a'], 'x'), undefined);
  });
});

describe('signInMessage', () => {
  for (const [why, code, expected] of [
    ['ポップアップを自分で閉じたら、何も言わない', 'auth/popup-closed-by-user', ''],
    ['ポップアップを開き直したら、何も言わない', 'auth/cancelled-popup-request', ''],
    ['時間切れなら、もう一度押すよう促す', 'timeout', '接続できませんでした。もう一度押してください'],
    [
      'ポップアップがブロックされたら、もう一度押すよう促す',
      'auth/popup-blocked',
      'ポップアップが開けませんでした。もう一度押してください',
    ],
    [
      'ネットワークの失敗は、ログインできなかったと伝える',
      'auth/network-request-failed',
      'ログインできませんでした',
    ],
    ['コードのない失敗も、ログインできなかったと伝える', undefined, 'ログインできませんでした'],
  ])
    test(why, () => {
      assert.equal(signInMessage(code), expected);
    });
});
