// Scroll positions per history entry, kept in sessionStorage so a reload, or coming back
// from another document, lands where the visitor left. Only the latest entries are kept.
export const SCROLL_KEY = 'cp20-scroll';
const MAX_ENTRIES = 50;
const isPosition = (value) =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0);

/**
 * @param {string | null} raw the stored JSON, if any
 * @returns {Map<string, [number, number]>}
 */
export function readPositions(raw) {
  const positions = new Map();
  try {
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) return positions;
    for (const entry of parsed)
      if (Array.isArray(entry) && typeof entry[0] === 'string' && isPosition(entry[1]))
        positions.set(entry[0], [entry[1][0], entry[1][1]]);
  } catch {}
  return positions;
}

/**
 * @param {Map<string, [number, number]>} positions in insertion order (oldest first)
 * @returns {string}
 */
export const writePositions = (positions) => JSON.stringify([...positions].slice(-MAX_ENTRIES));
