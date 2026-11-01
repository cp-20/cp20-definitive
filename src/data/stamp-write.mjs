// One read-modify-write of a visitor's own sticker record through the database's REST API.
//
// Every write is one multi-path update of the page record and the writer's throttle entry (see
// database.rules.json). The throttle entry outlives deleted records, so the database can keep
// each account to one write a second, and its `prev` field must match the value read before the
// write: a compare-and-swap that makes a second tab's concurrent write fail instead of
// overwriting this one. A failed write is not retried; the sticker UI undoes the change.

/** Each request gives up after this; so does restoring a returning visitor's session. */
export const REQUEST_TIMEOUT_MS = 15000;
/** Stands for the database's own clock in a write. */
export const SERVER_TIME = { '.sv': 'timestamp' };
export const throttlePath = (uid) => `throttle/${uid}`;
export const recordPath = (page, uid) => `pages/${page}/${uid}`;
const throttleAt = (throttle) =>
  typeof throttle?.at === 'number' && Number.isFinite(throttle.at) ? throttle.at : 0;

/** The body of the multi-path update that stores `record` (null deletes it). */
export function writeBody(page, uid, record, throttle) {
  return {
    [recordPath(page, uid)]: record ?? null,
    [throttlePath(uid)]: { at: SERVER_TIME, prev: throttleAt(throttle) },
  };
}

/**
 * Reads the record, lets `update` edit it and stores it. Returns the record as stored, with the
 * server's times filled in (the PATCH reply holds the written values as a tree). `update` returns
 * undefined to leave the record as it is. Rejects when any request fails, including a write the
 * rules deny.
 * @param {{ fetch: typeof fetch; databaseURL: string; token: string; page: string; uid: string }} where
 * @param {(record: any) => unknown} update
 */
export async function writeRecord({ fetch, databaseURL, token, page, uid }, update) {
  const request = async (path, init = {}) => {
    const url = new URL(`${databaseURL}/${path}.json`);
    url.searchParams.set('auth', token);
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) throw Error(`${init.method || 'GET'} /${path}: HTTP ${response.status}`);
    return response.json();
  };
  const throttle = await request(throttlePath(uid));
  const record = await request(recordPath(page, uid));
  const next = update(record);
  if (next === undefined) return record;
  const written = await request('', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(writeBody(page, uid, next, throttle)),
  });
  return written?.pages?.[page]?.[uid] ?? null;
}
