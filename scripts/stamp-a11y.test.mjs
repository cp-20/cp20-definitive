// What the sticker sheet says out loud, and where keyboard focus goes.
import { describe, test } from 'node:test';
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
  for (const [args, expected] of [
    [['placed', 'ハート', 4], 'ハートを貼りました。残り4枚'],
    [['placed', 'いいね', 4, undefined, 'traP Missionの上'], 'いいねをtraP Missionの上に貼りました。残り4枚'],
    [
      ['placed', 'ハート', 0, 'クローバー', '経歴の上'],
      'ハートを経歴の上に貼りました。一番古いクローバーをはがしました',
    ],
    [['placed', 'ハート', -1], 'ハートを貼りました。残り0枚'],
    [['removed', 'ハート', 5], 'ハートをはがしました。残り5枚'],
    [['returned', 'いいね', 3], 'いいねをシール帳に戻しました'],
    [['kept', 'ハート', 3], 'ハートを元の場所に戻しました'],
    [['blocked', 'いいね', 3], 'ここには貼れません。いいねをシール帳に戻しました'],
    [['blocked-kept', 'ハート', 3], 'ここには貼れません。ハートを元の場所に戻しました'],
    [['failed', 'しーぴー', 0], '保存できませんでした。しーぴーを元に戻しました'],
  ])
    test(`${args.join(' / ')} →「${expected}」`, () => {
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
  for (const [code, expected] of [
    ['auth/popup-closed-by-user', ''],
    ['auth/cancelled-popup-request', ''],
    ['timeout', '接続できませんでした。もう一度押してください'],
    ['auth/popup-blocked', 'ポップアップが開けませんでした。もう一度押してください'],
    ['auth/network-request-failed', 'ログインできませんでした'],
    [undefined, 'ログインできませんでした'],
  ])
    test(`${code} →「${expected}」`, () => {
      assert.equal(signInMessage(code), expected);
    });
});
