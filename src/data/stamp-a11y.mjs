// What the sticker sheet says out loud, and where keyboard focus goes when the thing it was on
// leaves the page. Kept free of the DOM so the wording and the order can be tested in Node.

// Anchors that wrap other content (or have no heading of their own) are named by where they are.
const PLACES = {
  page: 'ページの余白',
  header: 'ヘッダー',
  footer: 'フッター',
  'work-image': '作品の画像',
};

/**
 * @param {string} anchor the data-stamp-anchor name
 * @param {string | null | undefined} label the anchor's heading or accessible name, if any
 * @returns {string} e.g. 「経歴の上」
 */
export function stampPlace(anchor, label) {
  const text = (label || '').replace(/\s+/g, ' ').trim();
  const name = Object.hasOwn(PLACES, anchor)
    ? PLACES[anchor]
    : text
      ? text.length > 40
        ? `${text.slice(0, 39)}…`
        : text
      : 'ページ';
  return `${name}の上`;
}

// Said instead of a place while the sticker in hand is over the open sheet (or the tab).
export const OVER_SHEET = 'シール帳の上（ここには貼れません）';

/**
 * @param {'placed' | 'removed' | 'returned' | 'blocked' | 'failed' | 'saved'} event
 * @param {string} name the sticker's name (ハート, …)
 * @param {number} remaining stickers still available on this page
 * @param {string} [pushedOut] the name of your oldest sticker, when placing this one took it off
 * @param {string} [place] where it was placed, from stampPlace (「経歴の上」)
 * @returns {string}
 */
export function stampAnnouncement(event, name, remaining, pushedOut, place) {
  const left = `残り${Math.max(0, remaining)}枚`;
  if (event === 'placed') {
    const done = place ? `${name}を${place}に貼りました` : `${name}を貼りました`;
    return pushedOut ? `${done}。一番古い${pushedOut}をはがしました` : `${done}。${left}`;
  }
  if (event === 'failed') return `保存できませんでした。${name}を元に戻しました`;
  if (event === 'saved') return `${name}を保存しました`;
  if (event === 'removed') return `${name}をはがしました。${left}`;
  if (event === 'blocked') return `ここには貼れません。${name}をシール帳に戻しました`;
  return `${name}をシール帳に戻しました`;
}

/**
 * The control to move to once the one at `removed` disappears: the next one, else the previous one.
 * @template T
 * @param {readonly T[]} items in focus order
 * @param {T} removed
 * @returns {T | undefined}
 */
export function focusAfterRemoval(items, removed) {
  const at = items.indexOf(removed);
  if (at < 0) return undefined;
  return items[at + 1] ?? items[at - 1];
}

/**
 * What the sheet says when signing in fails, by the error's code (Firebase's, or 'timeout').
 * Closing or replacing the popup is the visitor's own choice and says nothing.
 * @param {string | undefined} code
 * @returns {string}
 */
export function signInMessage(code) {
  const c = code || '';
  if (c.includes('popup-closed') || c.includes('cancelled-popup')) return '';
  if (c === 'timeout') return '接続できませんでした。もう一度押してください';
  if (c.includes('popup-blocked')) return 'ポップアップが開けませんでした。もう一度押してください';
  return 'ログインできませんでした';
}
