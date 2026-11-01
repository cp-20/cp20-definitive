// Optimistic updates: your changes to your stickers show at once, laid over what the database
// last sent, and are saved one at a time in the background. A change that fails to save is
// simply dropped, which puts the page back as it was. Kept free of the DOM and of Firebase so
// it can be tested in Node.
import { STAMPS_PER_PAGE, WRITE_SPACING_MS } from './stamp-limits.mjs';

/** @typedef {import('./stamp-types').PlacedStamp} PlacedStamp */
/** @typedef {import('./stamp-types').Operation} Operation */
/** @typedef {{ owner: string; stamps: PlacedStamp[]; placed?: PlacedStamp }} SavedRecord */

export const sameStamp = (a, b) => ['anchor', 'x', 'y', 'kind', 'angle'].every((key) => a[key] === b[key]);

/**
 * The stickers to draw: `remote` with the pending `operations` applied in order.
 * Your stickers that have not been saved yet have the owner 'local'.
 * @param {readonly PlacedStamp[]} remote
 * @param {readonly Operation[]} operations
 * @param {string} owner your account's uid ('' when signed out)
 * @returns {PlacedStamp[]}
 */
export function projectStamps(remote, operations, owner) {
  let result = [...remote];
  for (const op of operations) {
    if (op.type === 'remove') {
      result = result.filter((s) => s.id !== op.target.id);
      continue;
    }
    // A moved sticker takes its old place (and age), so it pushes nothing out.
    const moved = op.type === 'move' && result.find((s) => s.id === op.target.id);
    // A stream event can arrive before the save's own reply. Keep one visual copy.
    result = result.filter(
      (s) => !(s.owner === owner && sameStamp(s, op.stamp)) && !(moved && s.id === moved.id),
    );
    if (moved) {
      result.push({ ...op.stamp, createdAt: moved.createdAt });
      continue;
    }
    const own = result
      .filter((s) => s.owner === owner || s.owner === 'local')
      .sort((a, b) => a.createdAt - b.createdAt);
    if (own.length >= STAMPS_PER_PAGE) result = result.filter((s) => s.id !== own[0].id);
    result.push(op.stamp);
  }
  return result;
}

/**
 * Runs the writes given to it one after another, each starting `spacing` ms after the previous
 * one finished (the database rejects a second write by the same account within a second).
 * @param {(ms: number) => Promise<void>} wait
 * @param {number} [spacing]
 */
export function serialWrites(wait, spacing = WRITE_SPACING_MS) {
  let last = Promise.resolve();
  /** @template T @param {() => Promise<T>} write @returns {Promise<T>} */
  return (write) => {
    const done = last.then(write);
    last = done.then(
      () => wait(spacing),
      () => wait(spacing),
    );
    return done;
  };
}

/**
 * The changes waiting to be saved. `add` shows a change at once (through `changed`) and saves it
 * after the ones before it; once it has saved or failed it leaves the list, and the promise it
 * returned settles. A sticker placed or moved here is known by a local id until it saves; later
 * changes to it are then sent for the saved sticker. A sticker whose move failed stands for the
 * sticker it was moved from again.
 * `send` makes the requests and returns the saved record, or null when there was nothing to send.
 * @param {{
 *   send: {
 *     place(op: Operation & { type: 'add' | 'move' }): Promise<SavedRecord | null>;
 *     move(op: Operation & { type: 'move' }, target: PlacedStamp): Promise<SavedRecord | null>;
 *     remove(op: Operation & { type: 'remove' }, target: PlacedStamp): Promise<SavedRecord | null>;
 *   };
 *   wait: (ms: number) => Promise<void>;
 *   changed: (pending: readonly Operation[]) => void;
 * }} options
 */
export function createPendingSaves({ send, wait, changed }) {
  /** @type {readonly Operation[]} */
  let pending = [];
  /** @type {Map<string, PlacedStamp>} a local sticker id → the sticker it stands for now */
  const standsFor = new Map();
  const resolve = (stamp) => standsFor.get(stamp.id) ?? stamp;
  const update = (next) => {
    pending = next;
    changed(pending);
  };
  const retarget = (id, stamp) => {
    standsFor.set(id, stamp);
    update(pending.map((op) => (op.type !== 'add' && op.target.id === id ? { ...op, target: stamp } : op)));
  };
  const write = serialWrites(wait);
  /** @param {Operation} op */
  const save = (op) => {
    if (op.type === 'add') return send.place(op);
    const target = resolve(op.target);
    // A sticker whose own placement never saved needs no request to be peeled, and is placed
    // afresh when moved.
    if (target.owner === 'local') return op.type === 'remove' ? Promise.resolve(null) : send.place(op);
    return op.type === 'remove' ? send.remove(op, target) : send.move(op, target);
  };
  return {
    /** @param {Operation} op @returns {Promise<SavedRecord | null>} */
    add(op) {
      update([...pending, op]);
      const leave = () => update(pending.filter((item) => item.id !== op.id));
      return write(() => save(op)).then(
        (saved) => {
          if (saved?.placed && op.type !== 'remove') retarget(op.stamp.id, saved.placed);
          leave();
          return saved;
        },
        (error) => {
          if (op.type === 'move') retarget(op.stamp.id, resolve(op.target));
          leave();
          throw error;
        },
      );
    },
  };
}
