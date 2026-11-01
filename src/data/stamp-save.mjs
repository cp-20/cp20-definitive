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
 *   place(path: string, stamp: StampData, account: Account, reuse?: boolean): Promise<SavedRecord & { placed?: PlacedStamp }>;
 *   move(path: string, target: PlacedStamp, stamp: StampData, account: Account, reuse?: boolean): Promise<SavedRecord & { placed?: PlacedStamp }>;
 *   remove(path: string, target: PlacedStamp, account: Account): Promise<SavedRecord>;
 * }} SaveApi
 */

/**
 * Sends one operation. `resolve` maps a sticker the queue placed earlier to its saved version.
 * A sticker whose own placement never saved (owner 'local') is placed afresh when moved, and
 * removing one needs no request at all (`result` is null). A place or move whose saved record
 * does not hold the sticker counts as failed, like a failed request: the queue then offers a
 * retry, and later operations on that sticker still see its unsaved local version.
 * A retried place or move (`op.retry`) may have reached the database the first time with only
 * the reply lost (a timeout, a dropped connection), so it reuses an identical stored sticker
 * instead of saving a second one.
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
  const reuse = !!op.retry;
  const added =
    target && target.owner !== 'local'
      ? await api.move(op.path, target, { anchor, x, y, kind, angle }, who, reuse)
      : await api.place(op.path, { anchor, x, y, kind, angle }, who, reuse);
  if (!added.placed) throw Error('The saved record does not hold the sticker');
  return { result: added, placed: added.placed };
}

/**
 * What the write queue remembers between operations, so a retried save cannot undo or repeat
 * what later operations on the same sticker already did.
 * - A sticker's saved version, once its place or move saved (`resolve`).
 * - A sticker whose move failed keeps standing for the saved sticker it was moved from, so a
 *   later move or removal of it acts on that one.
 * - A sticker that a later move or removal took over (`superseded`): its own failed add or move
 *   is then settled and must not be sent again. A failed add followed by a move that placed the
 *   sticker afresh would otherwise save it twice.
 * - A failed move is also settled once a later move or removal acts on the saved sticker it was
 *   moved from (shown again after the failure): retrying it would bring back a peeled sticker,
 *   or save a second copy of one moved elsewhere.
 */
export function createSaveLedger() {
  /** @type {Map<string, PlacedStamp>} */
  const saved = new Map();
  /** @type {Set<string>} */
  const handled = new Set();
  // Failed moves: the moved sticker's id → the id of the saved sticker it was moved from.
  /** @type {Map<string, string>} */
  const movedFrom = new Map();
  /** @param {PlacedStamp} stamp */
  const resolve = (stamp) => saved.get(stamp.id) || stamp;
  return {
    resolve,
    /** @param {Operation} op */
    superseded: (op) => op.type !== 'remove' && handled.has(op.stamp.id),
    /** Called as the queue starts sending `op`. @param {Operation} op */
    start(op) {
      if (op.type === 'add') return;
      handled.add(op.target.id);
      const base = resolve(op.target).id;
      for (const [id, from] of movedFrom) {
        // A retry of the failed move itself carries the same sticker and is not taken over.
        if (from === base && !(op.type === 'move' && op.stamp.id === id)) handled.add(id);
      }
    },
    /** @param {Operation & { type: 'add' | 'move' }} op @param {PlacedStamp} placed */
    saved(op, placed) {
      saved.set(op.stamp.id, placed);
      movedFrom.delete(op.stamp.id);
    },
    /** @param {Operation} op */
    failed(op) {
      if (op.type !== 'move') return;
      const from = resolve(op.target);
      saved.set(op.stamp.id, from);
      movedFrom.set(op.stamp.id, from.id);
    },
  };
}

/**
 * How long to wait before the next write so the database's interval is kept.
 * @param {number} lastWrite when the previous write finished (0: never)
 */
export const writeDelay = (lastWrite, now = Date.now()) => Math.max(0, WRITE_SPACING_MS - (now - lastWrite));
