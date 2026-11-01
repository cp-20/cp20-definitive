// Saving one queued sticker operation (see the write queue in src/components/Stamps.tsx).
// Kept free of the DOM and of Firebase so the branches can be tested in Node.
import { WRITE_SPACING_MS } from './stamp-limits.mjs';

/** @typedef {import('./stamp-types').PlacedStamp} PlacedStamp */
/** @typedef {import('./stamp-types').Account} Account */
/** @typedef {import('./stamp-types').Operation} Operation */
/** @typedef {Omit<import('./stamp-types').Stamp, 'createdAt'>} StampData */
/** @typedef {{ owner: string; stamps: PlacedStamp[] }} SavedRecord */
/**
 * @typedef {{
 *   place(path: string, stamp: StampData, account: Account): Promise<SavedRecord & { placed?: PlacedStamp }>;
 *   move(path: string, target: PlacedStamp, stamp: StampData, account: Account): Promise<SavedRecord & { placed?: PlacedStamp }>;
 *   remove(path: string, target: PlacedStamp, account: Account): Promise<SavedRecord>;
 * }} SaveApi
 */

/**
 * Sends one operation. `resolve` maps a sticker the queue placed earlier to its saved version.
 * A sticker whose own placement never saved (owner 'local') is placed afresh when moved, and
 * removing one needs no request at all (`result` is null). A place or move whose saved record
 * does not hold the sticker counts as failed, like a failed request: the queue then offers a
 * retry, and later operations on that sticker still see its unsaved local version.
 * @param {SaveApi} api
 * @param {Operation} op
 * @param {Account} who
 * @param {(stamp: PlacedStamp) => PlacedStamp} resolve
 * @returns {Promise<{ result: SavedRecord | null; placed?: PlacedStamp }>}
 */
export async function saveOperation(api, op, who, resolve) {
  if (op.type === 'remove') {
    const target = resolve(op.target);
    if (target.owner === 'local') return { result: null };
    return { result: await api.remove(op.path, target, who) };
  }
  const { anchor, x, y, kind, angle } = op.stamp;
  const target = op.type === 'move' ? resolve(op.target) : undefined;
  const added =
    target && target.owner !== 'local'
      ? await api.move(op.path, target, { anchor, x, y, kind, angle }, who)
      : await api.place(op.path, { anchor, x, y, kind, angle }, who);
  if (!added.placed) throw Error('The saved record does not hold the sticker');
  return { result: added, placed: added.placed };
}

/**
 * How long to wait before the next write so the database's interval is kept.
 * @param {number} lastWrite when the previous write finished (0: never)
 */
export const writeDelay = (lastWrite, now = Date.now()) => Math.max(0, WRITE_SPACING_MS - (now - lastWrite));
