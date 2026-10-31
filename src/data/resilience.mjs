// Small helpers that keep the page usable on flaky, captive or hung networks.

/**
 * How long to wait before reopening a sticker stream the browser gave up on (an HTTP error,
 * an HTML captive portal, a cancelled listener). EventSource only retries network drops by
 * itself, so these cases back off 2s → 4s → … up to a minute.
 * @param {number} attempt 0 for the first retry
 * @returns {number} milliseconds
 */
export const reconnectDelay = (attempt) => Math.min(60000, 2000 * 2 ** Math.max(0, Math.min(attempt, 10)));

/** Thrown by `deadline` when the work did not finish in time. */
export class TimeoutError extends Error {
  code = 'timeout';
  constructor() {
    super('Timed out');
    this.name = 'TimeoutError';
  }
}

/**
 * Rejects with a TimeoutError if `work` has not settled within `ms`. When `paused` is given,
 * the timer stops once it resolves (e.g. the sign-in popup has opened and the visitor is busy
 * in it), so only the network-bound part is timed. The work itself keeps running.
 * @template T
 * @param {Promise<T>} work
 * @param {number} ms
 * @param {Promise<unknown>} [paused]
 * @returns {Promise<T>}
 */
export function deadline(work, ms, paused) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError()), ms);
    paused?.then(
      () => clearTimeout(timer),
      () => {},
    );
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

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
