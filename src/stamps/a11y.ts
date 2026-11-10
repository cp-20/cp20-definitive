// What the sticker sheet says out loud, and where keyboard focus goes when the thing it was on
// leaves the page.

// Anchors that wrap other content (or have no heading of their own) are named by where they are.
const PLACES: Record<string, string> = {
  page: 'ページの余白',
  header: 'ヘッダー',
  footer: 'フッター',
  'work-image': '作品の画像',
};

/**
 * @param anchor the data-stamp-anchor name
 * @param label the anchor's heading or accessible name, if any
 * @returns e.g. 「経歴の上」
 */
export function stampPlace(anchor: string, label: string | null | undefined): string {
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
 * @param event kept / blocked-kept: one of your stickers being moved went back where it was on the page
 * @param name the sticker's name (ハート, …)
 * @param remaining stickers still available on this page
 * @param pushedOut the name of your oldest sticker, when placing this one took it off
 * @param place where it was placed, from stampPlace (「経歴の上」)
 */
export function stampAnnouncement(
  event: 'placed' | 'removed' | 'returned' | 'kept' | 'blocked' | 'blocked-kept' | 'failed',
  name: string,
  remaining: number,
  pushedOut?: string,
  place?: string,
): string {
  const left = `残り${Math.max(0, remaining)}枚`;
  if (event === 'placed') {
    const done = place ? `${name}を${place}に貼りました` : `${name}を貼りました`;
    return pushedOut ? `${done}。一番古い${pushedOut}をはがしました` : `${done}。${left}`;
  }
  if (event === 'failed') return `保存できませんでした。${name}を元に戻しました`;
  if (event === 'removed') return `${name}をはがしました。${left}`;
  if (event === 'blocked') return `ここには貼れません。${name}をシール帳に戻しました`;
  if (event === 'blocked-kept') return `ここには貼れません。${name}を元の場所に戻しました`;
  if (event === 'kept') return `${name}を元の場所に戻しました`;
  return `${name}をシール帳に戻しました`;
}

/**
 * The control to move to once the one at `removed` disappears: the next one, else the previous one.
 * @param items in focus order
 */
export function focusAfterRemoval<T>(items: readonly T[], removed: T): T | undefined {
  const at = items.indexOf(removed);
  if (at < 0) return undefined;
  return items[at + 1] ?? items[at - 1];
}

/**
 * What the sheet says when signing in fails, by the error's code (Firebase's, or 'timeout').
 * Closing or replacing the popup is the visitor's own choice and says nothing.
 */
export function signInMessage(code: string | undefined): string {
  const c = code || '';
  if (c.includes('popup-closed') || c.includes('cancelled-popup')) return '';
  if (c === 'timeout') return '接続できませんでした。もう一度押してください';
  if (c.includes('popup-blocked')) return 'ポップアップが開けませんでした。もう一度押してください';
  return 'ログインできませんでした';
}
