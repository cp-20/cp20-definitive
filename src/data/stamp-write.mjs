import { WRITE_SPACING_MS } from './stamp-limits.mjs';
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
export const retryDelay = (at, now = Date.now()) =>
  Math.min(WRITE_SPACING_MS, Math.max(150, at + WRITE_SPACING_MS - now));
// One read-modify-write of a sticker record. The throttle entry is read first: if anything is
// written after that, the compare-and-swap fails, so a second tab cannot overwrite a
// concurrent change. A denied write is retried with fresh data once the database's interval
// since the latest write (ours or another tab's) has passed, so the retry is not denied
// again for coming too soon; data the rules reject stays denied and runs out of attempts.
// `update` returns the new record, or undefined to leave it as it is.
export async function writeWithRetry({ readThrottle, readRecord, save, wait }, update, attempts = 4) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const throttle = await readThrottle();
    const previous = await readRecord();
    const data = update(previous);
    if (data === undefined) return previous;
    const saved = await save(data, throttle);
    if (!saved.denied) return saved.record;
    await wait(retryDelay(throttleAt(await readThrottle())));
  }
  throw Error('Concurrent update; try again');
}
