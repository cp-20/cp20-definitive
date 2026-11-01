import { STICKER_KINDS } from './sticker-kinds.mjs';
// The limits shared by the sticker UI, its saving and database.rules.json
// (scripts/database-rules.mjs builds the rules from these, so changing one changes the rules).

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
/** Google's sign-in scripts can hang on a bad network; the button is released after this long. */
export const SIGN_IN_TIMEOUT_MS = 20000;
/** Each read or write of one's own stickers, including fetching the ID token, gives up after this. */
export const REQUEST_TIMEOUT_MS = 15000;
/** Restoring a returning visitor's session (which may refresh their token) gives up after this. */
export const AUTH_TIMEOUT_MS = 15000;
/** A sticker stream the browser is still reconnecting after this long is reported as lost. */
export const STREAM_STALL_MS = 8000;
