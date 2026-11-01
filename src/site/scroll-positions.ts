// Scroll positions per history entry, kept in sessionStorage so a reload, or coming back
// from another document, lands where the visitor left. Only the latest entries are kept.
export const SCROLL_KEY = 'cp20-scroll';
const MAX_ENTRIES = 50;
const isPosition = (value: unknown): value is [number, number] =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0);

/** @param raw the stored JSON, if any */
export function readPositions(raw: string | null): Map<string, [number, number]> {
  const positions = new Map<string, [number, number]>();
  try {
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) return positions;
    for (const entry of parsed)
      if (Array.isArray(entry) && typeof entry[0] === 'string' && isPosition(entry[1]))
        positions.set(entry[0], [entry[1][0], entry[1][1]]);
  } catch {}
  return positions;
}

/** @param positions in insertion order (oldest first) */
export const writePositions = (positions: Map<string, [number, number]>) =>
  JSON.stringify([...positions].slice(-MAX_ENTRIES));
