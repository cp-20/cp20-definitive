// Titles as the pages set them: the spaces beside full-width brackets, and the bracket that hangs.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { setTitle } from './Title.tsx';
import { BREAK } from '../content/phrase-marks.ts';

describe('setTitle', () => {
  test('全角のカッコの隣の空白を除き、改行できる所として残す', () => {
    assert.deepEqual(setTitle('Vueコミュニティが最高過ぎる件 【#vuefes 参加記】'), {
      rest: `Vueコミュニティが最高過ぎる件${BREAK}【#vuefes\u00a0参加記】`,
    });
  });
  test('欧文どうしの空白はそのまま。短いカッコの中の空白では改行しない', () => {
    assert.equal(setTitle('ISUCON 初心者 戦える？').rest, 'ISUCON 初心者 戦える？');
    assert.equal(setTitle('【 #ISUCON 】最近の若者は').rest, '\u00a0#ISUCON\u00a0】最近の若者は');
    assert.equal(setTitle('26班 『traP Mission』').rest, `26班${BREAK}『traP\u00a0Mission』`);
    const long = '「それはそれとして、とても長いカッコの中の文章です」';
    assert.equal(setTitle(`${long.slice(0, 8)} ${long.slice(8)}`).rest.includes(' '), true);
  });
  test('題名の頭の開きカッコを、ぶら下げる1文字として分ける', () => {
    assert.deepEqual(setTitle('【低レイヤ最適化】1BRC for traP を開催しました！'), {
      hang: '【',
      rest: '低レイヤ最適化】1BRC for traP を開催しました！',
    });
    assert.equal(setTitle('「ギャンギャンギャンブル」 ー 26年度春ハッカソン3班').rest, `ギャンギャンギャンブル」${BREAK}ー 26年度春ハッカソン3班`);
    assert.equal(setTitle('社会性').hang, undefined);
  });
});
