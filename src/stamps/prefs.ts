// The sticker preferences kept in localStorage. Storage can be unavailable (private windows,
// blocked site data); reading then gives null and writing does nothing.
// The visitor's reduced-motion setting, read when an animation starts.
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const HIDE_KEY = 'cp20-hide-stamps';
export const SHEET_KEY = 'cp20-sticker-sheet';
// Set while signed in, so the auth SDK is loaded straight away on the next visit.
export const ACCOUNT_KEY = 'cp20-sticker-account';
export function readPref(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
// null removes the entry.
export function writePref(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
}
