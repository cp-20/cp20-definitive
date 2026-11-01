// The open sticker sheet is 300px wide and pinned 20px from the right edge (plus a slight tilt).
// It only starts open when it fits on the desk beside the loose-leaf sheet; otherwise it would
// sit on top of the page content, so it starts as the closed tab like on phones.
export const SHEET_DESK_SPACE = 330;

/**
 * @param stored the visitor's last choice ('open' / 'closed'), if any
 * @param pageRight right edge of the .site-body sheet in viewport pixels
 */
export function sheetStartsOpen(stored: string | null, viewportWidth: number, pageRight: number) {
  if (stored) return stored !== 'closed';
  return viewportWidth - pageRight >= SHEET_DESK_SPACE;
}
