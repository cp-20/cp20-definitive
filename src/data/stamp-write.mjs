// Every sticker write is one multi-path update of the page record and the writer's throttle
// entry (see database.rules.json). The throttle entry outlives deleted records, so the
// database can keep each account to one write a second, and its `prev` field must match the
// value read before the write: a compare-and-swap that stops a second tab from overwriting a
// concurrent change (Firebase has no conditional multi-path update).
const timestamp = { '.sv': 'timestamp' };
export const throttlePath = (uid) => `throttle/${uid}`;
export const recordPath = (page, uid) => `pages/${page}/${uid}`;
export const throttleAt = (throttle) =>
  typeof throttle?.at === 'number' && Number.isFinite(throttle.at) ? throttle.at : 0;
export function writeBody(page, uid, record, throttle) {
  return {
    [recordPath(page, uid)]: record ?? null,
    [throttlePath(uid)]: { at: timestamp, prev: throttleAt(throttle) },
  };
}
// How long to wait before writing again after the previous write at `at` (server time),
// judged with the local clock; at least a little so a skewed clock still backs off.
export const retryDelay = (at, now = Date.now()) => Math.min(1100, Math.max(150, at + 1100 - now));
