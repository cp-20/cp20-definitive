// Firebase may encode numeric slot keys as an array with null holes.
export const stampEntries = (record) =>
  Object.entries(record?.stamps || {}).filter(([, stamp]) => stamp != null);
const SLOTS = ['0', '1', '2', '3', '4'];
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
export function placeIn(record, stamp, createdAt) {
  const stamps = Object.fromEntries(stampEntries(record));
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
export function moveIn(record, target, stamp, createdAt) {
  const stamps = Object.fromEntries(stampEntries(record));
  if (!holds(stamps, target)) return placeIn(record, stamp, createdAt);
  stamps[target.slot] = { ...pick(stamp), createdAt: stamps[target.slot].createdAt };
  return { slot: target.slot, stamps };
}
