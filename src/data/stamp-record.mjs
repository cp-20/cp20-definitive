import { ANCHOR_PATTERN, MAX_ANGLE, STAMP_SLOTS as SLOTS, STICKER_KIND_COUNT } from './stamp-limits.mjs';
const anchorPattern = new RegExp(ANCHOR_PATTERN);
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
// Firebase may encode numeric slot keys as an array with null holes.
export const stampEntries = (record) =>
  Object.entries(record?.stamps || {}).filter(([slot, stamp]) => wellFormed(slot, stamp));
const visual = ['anchor', 'x', 'y', 'kind', 'angle'];
// The stored sticker in `target`'s slot is still the one the visitor saw (not a newer one a
// second tab put in the same slot).
const pick = (stamp) => Object.fromEntries(visual.map((k) => [k, stamp[k]]));
const holds = (stamps, target) => {
  const stored = stamps[target.slot];
  return !!stored && stored.createdAt === target.createdAt && visual.every((k) => stored[k] === target[k]);
};
// The record edits behind placing, peeling and moving a sticker. Each takes the stored record
// and returns the slot it wrote and the new stamps (undefined when there is nothing to do).
// `createdAt` is the server-timestamp placeholder for a new sticker.
// `reuse` is set when retrying a save whose reply was lost: if the record already holds the
// same sticker (the earlier request did reach the database), it is not placed a second time.
export function placeIn(record, stamp, createdAt, reuse = false) {
  const stamps = Object.fromEntries(stampEntries(record));
  const same = reuse && Object.keys(stamps).find((s) => visual.every((k) => stamps[s][k] === stamp[k]));
  if (same) return { slot: same, stamps: undefined };
  // A free slot, else the oldest sticker makes room.
  const slot =
    SLOTS.find((s) => !stamps[s]) ||
    Object.keys(stamps).sort((a, b) => stamps[a].createdAt - stamps[b].createdAt)[0];
  stamps[slot] = { ...pick(stamp), createdAt };
  return { slot, stamps };
}
export function removeFrom(record, target) {
  const stamps = Object.fromEntries(stampEntries(record));
  if (!holds(stamps, target)) return { slot: target.slot, stamps: undefined };
  delete stamps[target.slot];
  return { slot: target.slot, stamps };
}
// Moving rewrites the sticker in its own slot and keeps its age, so it never pushes out
// another sticker. If it is gone (peeled in another tab), the visitor still gets it where
// they dropped it, as a new sticker.
export function moveIn(record, target, stamp, createdAt, reuse = false) {
  const stamps = Object.fromEntries(stampEntries(record));
  if (!holds(stamps, target)) return placeIn(record, stamp, createdAt, reuse);
  stamps[target.slot] = { ...pick(stamp), createdAt: stamps[target.slot].createdAt };
  return { slot: target.slot, stamps };
}
