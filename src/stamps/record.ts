// A visitor's record of stickers on one page, and the edits behind placing, moving and peeling
// them. Kept free of the DOM and of Firebase so it can be tested in Node.
import { ANCHOR_PATTERN, MAX_ANGLE, STAMP_SLOTS as SLOTS, STICKER_KIND_COUNT } from './limits.ts';
import type { PlacedStamp, Stamp } from './types.ts';

// As stored, or as the stream delivers it: anything may be in it.
type StampRecord = { updatedAt?: unknown; stamps?: Record<string, unknown> | unknown[]; avatar?: unknown };

const anchorPattern = new RegExp(ANCHOR_PATTERN);
const gravatarPattern = /^[0-9a-f]{64}$/;
const fraction = (v: unknown) => typeof v === 'number' && v >= 0 && v <= 1;
// What the rules accept. Anything else (e.g. a `{".value", ".priority"}` pair from the stream)
// is dropped, so it can neither break the drawing nor be written back.
const wellFormed = (slot: string, s: any): s is Stamp =>
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
 */
export const stampEntries = (record: StampRecord | null | undefined) =>
  Object.entries(record?.stamps || {}).filter(([slot, stamp]) => wellFormed(slot, stamp)) as [
    string,
    Stamp,
  ][];

/** The stickers of `owner`'s record as the page draws them. */
export const recordStamps = (owner: string, record: StampRecord | null | undefined): PlacedStamp[] =>
  stampEntries(record).map(([slot, stamp]) => ({
    ...stamp,
    id: `${owner}-${slot}`,
    owner,
    slot,
    avatar:
      typeof record?.avatar === 'string' && gravatarPattern.test(record.avatar) ? record.avatar : undefined,
  }));

type Look = Omit<Stamp, 'createdAt'>;
const pick = ({ anchor, x, y, kind, angle }: Look) => ({ anchor, x, y, kind, angle });
// Each edit takes the stored record and returns the slot it wrote and the new stamps.

/**
 * Places a sticker in a free slot, else in place of the oldest one. `createdAt` is the time
 * given to it (the database's clock).
 */
export function placeIn(record: StampRecord | null | undefined, stamp: Look, createdAt: unknown) {
  const entries = stampEntries(record);
  const stamps: Record<string, unknown> = Object.fromEntries(entries);
  const slot =
    SLOTS.find((s) => !stamps[s]) || entries.sort(([, a], [, b]) => a.createdAt - b.createdAt)[0][0];
  stamps[slot] = { ...pick(stamp), createdAt };
  return { slot, stamps };
}

// Peeling and moving work on the slot the page showed. A view made stale by another tab is
// rare, and the stream puts the page right afterwards.

/** Peels `target` off: empties its slot. */
export function removeFrom(record: StampRecord | null | undefined, target: PlacedStamp) {
  const stamps: Record<string, unknown> = Object.fromEntries(stampEntries(record));
  delete stamps[target.slot];
  return { slot: target.slot, stamps };
}

/** Rewrites `target`'s slot and keeps its age, so moving never pushes out another sticker. */
export function moveIn(record: StampRecord | null | undefined, target: PlacedStamp, stamp: Look) {
  const stamps: Record<string, unknown> = Object.fromEntries(stampEntries(record));
  stamps[target.slot] = { ...pick(stamp), createdAt: target.createdAt };
  return { slot: target.slot, stamps };
}

/**
 * The record to store for the edited stamps: deleted once empty (null), else the stamps with the
 * visitor's Gravatar hash and the update time.
 */
export const nextRecord = (stamps: Record<string, unknown>, avatar: string, updatedAt: unknown) =>
  Object.keys(stamps).length ? { stamps, updatedAt, avatar } : null;
