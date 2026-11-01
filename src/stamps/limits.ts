import { STICKER_KINDS } from './sticker-kinds.ts';
// The limits shared by the sticker UI, its saving and database.rules.json
// (scripts/firebase/rules.ts builds the rules from these, so changing one changes the rules).

/** Stickers one visitor can keep on one page; a new one past this replaces their oldest. */
export const STAMPS_PER_PAGE = 5;
/** The record's slot keys: '0' … '4'. */
export const STAMP_SLOTS = Array.from({ length: STAMPS_PER_PAGE }, (_, i) => String(i));
/** Sticker designs; kinds are 0 … STICKER_KIND_COUNT - 1. */
export const STICKER_KIND_COUNT = STICKER_KINDS.length;
/** A sticker's tilt, in degrees either way. */
export const MAX_ANGLE = 20;
/** The database rejects a second write by the same account sooner than this. */
export const WRITE_INTERVAL_MS = 1000;
/** The client waits this long between its own writes, a little over the interval. */
export const WRITE_SPACING_MS = 1100;
/** What a sticker may be anchored to: a data-stamp-anchor name. */
export const ANCHOR_PATTERN = '^[a-z0-9-]{1,96}$';
