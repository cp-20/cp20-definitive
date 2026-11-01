import config from './data/firebase.json';
import { applyStreamEvent, coalesce, keepStream } from './data/stamp-stream.mjs';
import { moveIn, nextRecord, placeIn, recordStamps, removeFrom } from './data/stamp-record.mjs';
import { deadline } from './data/resilience.mjs';
import { SERVER_TIME, writeRecord } from './data/stamp-write.mjs';
import { pageKey } from './data/site-pages.mjs';
import {
  AUTH_TIMEOUT_MS as AUTH_TIMEOUT,
  REQUEST_TIMEOUT_MS as REQUEST_TIMEOUT,
  SIGN_IN_TIMEOUT_MS as SIGN_IN_TIMEOUT,
} from './data/stamp-limits.mjs';
import type { Auth, User } from 'firebase/auth';
import type { Account, PlacedStamp, Stamp } from './data/stamp-types';
// The sticker client, loaded once the page needs stickers: the public stream of a page's
// stickers, Google sign-in, and saving your own stickers.
type RecordData = { updatedAt: number; stamps: Record<string, Stamp>; avatar?: string };
export function subscribe(path: string, receive: (stamps: PlacedStamp[]) => void, fail: () => void) {
  const url = new URL(`${config.databaseURL}/pages/${pageKey(path)}.json`);
  url.searchParams.set('orderBy', '"updatedAt"');
  url.searchParams.set('limitToLast', '100');
  let records: Record<string, RecordData> = {};
  // Events are applied as they arrive but rendered at most four times a second.
  const render = coalesce(() => {
    try {
      receive(Object.entries(records).flatMap(([owner, record]) => recordStamps(owner, record)));
    } catch {
      fail();
    }
  }, 250);
  const change = (type: string, event: MessageEvent) => {
    try {
      records = applyStreamEvent(records, type, JSON.parse(event.data));
      render.schedule();
    } catch {
      fail();
    }
  };
  return keepStream(url, { restart: render.cancel, receive: change, fail });
}

// ── Accounts ──
// Stickers can only be placed with a Google account; reading stays public.
// The auth module is kept once loaded so the sign-in popup opens within the click.
let auth: Promise<{ auth: Auth; sdk: typeof import('firebase/auth') }> | undefined;
function loadAuth() {
  return (auth ||= (async () => {
    const [{ initializeApp, getApps }, sdk] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
    ]);
    const app = getApps().find((a) => a.name === 'cp20-portfolio') || initializeApp(config, 'cp20-portfolio');
    const instance = sdk.getAuth(app);
    // A hung token refresh would otherwise keep a returning visitor waiting for 30 seconds.
    await deadline(instance.authStateReady(), AUTH_TIMEOUT);
    return { auth: instance, sdk };
  })().catch((error) => {
    auth = undefined;
    throw error;
  }));
}
const isGoogle = (user: User | null): user is User =>
  !!user && !user.isAnonymous && user.providerData.some((p) => p.providerId === 'google.com');
// Gravatar's hash: SHA-256 of the trimmed, lower-cased email address.
async function gravatarHash(email: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.trim().toLowerCase()));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function toAccount(user: User | null): Promise<Account | null> {
  if (!isGoogle(user)) return null;
  return { uid: user.uid, avatar: await gravatarHash(user.email || user.uid) };
}
export async function watchAccount(receive: (account: Account | null) => void) {
  const { auth, sdk } = await loadAuth();
  return sdk.onAuthStateChanged(auth, (user) => void toAccount(user).then(receive));
}
export async function signIn() {
  const { auth, sdk } = await deadline(loadAuth(), SIGN_IN_TIMEOUT);
  // Once the popup opens the page loses focus and the wait is the visitor's, not the network's.
  let opened!: () => void;
  const popup = new Promise<void>((resolve) => (opened = resolve));
  window.addEventListener('blur', opened, { once: true });
  try {
    const result = await deadline(
      sdk.signInWithPopup(auth, new sdk.GoogleAuthProvider()),
      SIGN_IN_TIMEOUT,
      popup,
    );
    return toAccount(result.user);
  } finally {
    window.removeEventListener('blur', opened);
  }
}
export async function signOut() {
  const { auth, sdk } = await loadAuth();
  await sdk.signOut(auth);
}
async function currentUser() {
  const { auth } = await loadAuth();
  if (!isGoogle(auth.currentUser)) throw Error('Sign in with Google to place stickers');
  return auth.currentUser;
}

// ── Saving ──
// Only a sticker's look and spot are sent; a new one's age is set by the database.
type StampData = Omit<Stamp, 'createdAt'>;
// One read-modify-write of your record on a page (src/data/stamp-write.mjs); `edit` returns the
// slot it wrote and the new stamps (undefined to change nothing). A place or move whose saved
// record does not hold the sticker counts as failed.
async function save(
  path: string,
  account: Account,
  edit: (record: RecordData | null) => { slot: string; stamps?: Record<string, unknown> },
  placing: boolean,
) {
  const user = await currentUser();
  const token = await deadline(user.getIdToken(), REQUEST_TIMEOUT);
  let slot = '';
  const record = (await writeRecord(
    { fetch, databaseURL: config.databaseURL, token, page: pageKey(path), uid: user.uid },
    (stored) => {
      const result = edit(stored as RecordData | null);
      slot = result.slot;
      return nextRecord(result.stamps, account.avatar, SERVER_TIME);
    },
  )) as RecordData | null;
  const stamps = recordStamps(account.uid, record);
  const placed = stamps.find((s) => s.slot === slot);
  if (placing && !placed) throw Error('The saved record does not hold the sticker');
  return { owner: account.uid, stamps, placed };
}
export const place = (path: string, stamp: StampData, account: Account) =>
  save(path, account, (record) => placeIn(record, stamp, SERVER_TIME), true);
// Does nothing if the slot now holds a newer stamp placed by another tab.
export const remove = (path: string, target: PlacedStamp, account: Account) =>
  save(path, account, (record) => removeFrom(record, target), false);
// Moving a sticker is one write of its own slot, so it never pushes out another sticker.
export const move = (path: string, target: PlacedStamp, stamp: StampData, account: Account) =>
  save(path, account, (record) => moveIn(record, target, stamp, SERVER_TIME), true);
