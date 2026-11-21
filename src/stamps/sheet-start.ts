// The open sticker sheet is 300px wide and pinned 20px from the right edge (plus a slight tilt).
// It only starts open when it fits on the desk beside the loose-leaf sheet; on phone widths it
// always starts tucked away so the sheet never opens over the page on load.
export const SHEET_DESK_SPACE = 330;
export const PHONE_MAX_WIDTH = 760;

/**
 * @param stored the visitor's last choice ('open' / 'closed'), if any
 * @param pageRight right edge of the .site-body sheet in viewport pixels
 */
export function sheetStartsOpen(stored: string | null, viewportWidth: number, pageRight: number) {
  if (viewportWidth <= PHONE_MAX_WIDTH) return false;
  if (stored) return stored !== 'closed';
  return viewportWidth - pageRight >= SHEET_DESK_SPACE;
}
