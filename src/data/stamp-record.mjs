// A visitor's record of stickers on one page, and the edits behind placing, moving and peeling
// them. Kept free of the DOM and of Firebase so it can be tested in Node.
import { ANCHOR_PATTERN, MAX_ANGLE, STAMP_SLOTS as SLOTS, STICKER_KIND_COUNT } from './stamp-limits.mjs';

/** @typedef {import('./stamp-types').Stamp} Stamp */
/** @typedef {import('./stamp-types').PlacedStamp} PlacedStamp */
/** @typedef {{ updatedAt: unknown; stamps: Record<string, unknown>; avatar?: unknown }} StampRecord */

const anchorPattern = new RegExp(ANCHOR_PATTERN);
const gravatarPattern = /^[0-9a-f]{64}$/;
const fraction = (v) => typeof v === 'number' && v >= 0 && v <= 1;
// What the rules accept. Anything else (e.g. a `{".value", ".priority"}` pair from the stream)
// is dropped, so it can neither break the drawing nor be written back.
const wellFormed = (slot, s) =>
  SLOTS.includes(slot) &&
  !!s &&
  typeof s === 'object' &&
  typeof s.anchor === 'string' &&
  anchorPattern.test(s.anchor) &&
  fraction(s.x) &&
  fraction(s.y) &&
  Number.isInteger(s.kind) &&
  s.kind >= 0 &&
  s.kind < STICKER_KIND_COUNT &&
  typeof s.angle === 'number' &&
  Math.abs(s.angle) <= MAX_ANGLE &&
  Number.isFinite(s.createdAt);

/**
 * The well-formed stickers of a record by slot. Firebase may encode the numeric slot keys as an
 * array with null holes.
 * @param {StampRecord | null | undefined} record
 * @returns {[string, Stamp][]}
 */
export const stampEntries = (record) =>
  Object.entries(record?.stamps || {}).filter(([slot, stamp]) => wellFormed(slot, stamp));

/**
 * The stickers of `owner`'s record as the page draws them.
 * @param {string} owner
 * @param {StampRecord | null | undefined} record
 * @returns {PlacedStamp[]}
 */
export const recordStamps = (owner, record) =>
  stampEntries(record).map(([slot, stamp]) => ({
    ...stamp,
    id: `${owner}-${slot}`,
    owner,
    slot,
    avatar:
      typeof record?.avatar === 'string' && gravatarPattern.test(record.avatar) ? record.avatar : undefined,
  }));

const pick = (stamp) => Object.fromEntries(['anchor', 'x', 'y', 'kind', 'angle'].map((k) => [k, stamp[k]]));
// Each edit takes the stored record and returns the slot it wrote and the new stamps
// (undefined when there is nothing to do). `createdAt` is the time given to a new sticker.

/** Places a sticker in a free slot, else in place of the oldest one. */
export function placeIn(record, stamp, createdAt) {
  const stamps = Object.fromEntries(stampEntries(record));
  const slot =
    SLOTS.find((s) => !stamps[s]) ||
    Object.keys(stamps).sort((a, b) => stamps[a].createdAt - stamps[b].createdAt)[0];
  stamps[slot] = { ...pick(stamp), createdAt };
  return { slot, stamps };
}

// Peeling and moving work on the slot the page showed. A view made stale by another tab is
// rare, and the stream puts the page right afterwards.

/** Peels `target` off: empties its slot. */
export function removeFrom(record, target) {
  const stamps = Object.fromEntries(stampEntries(record));
  delete stamps[target.slot];
  return { slot: target.slot, stamps };
}

/** Rewrites `target`'s slot and keeps its age, so moving never pushes out another sticker. */
export function moveIn(record, target, stamp) {
  const stamps = Object.fromEntries(stampEntries(record));
  stamps[target.slot] = { ...pick(stamp), createdAt: target.createdAt };
  return { slot: target.slot, stamps };
}

/**
 * The record to store for the edited stamps: unchanged (undefined), deleted once empty (null), or
 * the stamps with the visitor's Gravatar hash and the update time.
 * @param {Record<string, unknown> | undefined} stamps
 * @param {string} avatar
 * @param {unknown} updatedAt
 */
export const nextRecord = (stamps, avatar, updatedAt) =>
  stamps === undefined ? undefined : Object.keys(stamps).length ? { stamps, updatedAt, avatar } : null;
