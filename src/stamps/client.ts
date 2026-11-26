import config from '../data/firebase.json';
import { applyStreamEvent, coalesce, keepStream } from './stream.ts';
import { moveIn, nextRecord, placeIn, recordStamps, removeFrom } from './record.ts';
import { REQUEST_TIMEOUT_MS, SERVER_TIME, writeRecord } from './write.ts';
import { pageKey } from '../site/pages.ts';
import { avatarObjectUrl, avatarUpload, googlePhoto, type AvatarSource } from './avatar.ts';
import type { Auth, User } from 'firebase/auth';
import type { Account, Operation, PlacedStamp, SavedRecord, Stamp } from './types.ts';
// The sticker client, loaded once the page needs stickers: the public stream of a page's
// stickers, Google sign-in, and saving your own stickers.
type RecordData = { updatedAt: number; stamps: Record<string, Stamp> };
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
// Rejects with the code 'timeout' (see signInMessage) if `work` has not settled within `ms`.
const deadline = <T>(work: Promise<T>, ms: number) =>
  Promise.race([
    work,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(Object.assign(Error('Timed out'), { code: 'timeout' })), ms),
    ),
  ]);
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
    await deadline(instance.authStateReady(), REQUEST_TIMEOUT_MS);
    return { auth: instance, sdk };
  })().catch((error) => {
    auth = undefined;
    throw error;
  }));
}
const isGoogle = (user: User | null): user is User =>
  !!user && !user.isAnonymous && user.providerData.some((p) => p.providerId === 'google.com');
const toAccount = (user: User | null): Account | null => {
  if (!isGoogle(user)) return null;
  const photo = user.photoURL || user.providerData.find((p) => p.providerId === 'google.com')?.photoURL;
  return photo ? { uid: user.uid, photo } : { uid: user.uid };
};
export async function watchAccount(receive: (account: Account | null) => void) {
  const { auth, sdk } = await loadAuth();
  return sdk.onAuthStateChanged(auth, (user) => receive(toAccount(user)));
}
export async function signIn() {
  const { auth, sdk } = await loadAuth();
  const result = await sdk.signInWithPopup(auth, new sdk.GoogleAuthProvider());
  return toAccount(result.user);
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
// One read-modify-write of your record on a page (write.ts). Only a sticker's
// look and spot are sent; a new one's age is set by the database. `target` is the saved sticker
// a move or peel is for.
export async function save(
  op: Operation,
  target: PlacedStamp | undefined,
  account: Account,
): Promise<SavedRecord> {
  const user = await currentUser();
  const token = await user.getIdToken();
  const edit = (record: RecordData | null) =>
    op.type === 'add'
      ? placeIn(record, op.stamp, SERVER_TIME)
      : op.type === 'remove'
        ? removeFrom(record, target ?? op.target)
        : moveIn(record, target ?? op.target, op.stamp);
  let slot = '';
  const record = (await writeRecord(
    { fetch, databaseURL: config.databaseURL, token, page: pageKey(op.path), uid: user.uid },
    (stored) => {
      const result = edit(stored as RecordData | null);
      slot = result.slot;
      return nextRecord(result.stamps, SERVER_TIME);
    },
  )) as RecordData | null;
  const stamps = recordStamps(account.uid, record);
  return { owner: account.uid, stamps, placed: stamps.find((s) => s.slot === slot) };
}

// ── Icon ──
// Your picture is uploaded straight to Cloud Storage (storage.rules: only to your own path, only a
// small WebP or JPEG), with where it came from in its metadata.
/** Where `uid`'s stored picture came from, or null without one. Anyone can read this. */
export async function avatarSource(uid: string): Promise<AvatarSource | null> {
  const response = await fetch(avatarObjectUrl(uid), { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (response.status === 404) return null;
  if (!response.ok) throw Error(`GET avatar: HTTP ${response.status}`);
  return (await response.json())?.metadata?.source === 'google' ? 'google' : 'upload';
}
/** Your Google account's picture, as it is to be shrunk. */
export async function fetchGooglePhoto() {
  const user = await currentUser();
  const photo = toAccount(user)?.photo;
  if (!photo) throw Error('No Google picture');
  const response = await fetch(googlePhoto(photo), { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw Error(`GET Google picture: HTTP ${response.status}`);
  return response.blob();
}
/** Stores `picture` (already made small by compressAvatar) as your icon. */
export async function uploadAvatar(picture: Blob, source: AvatarSource) {
  const user = await currentUser();
  const { url, init } = avatarUpload(user.uid, picture, await user.getIdToken(), source);
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw Error(`POST avatar: HTTP ${response.status}`);
}
/** Deletes your icon picture, so your stickers show your pattern. */
export async function removeAvatar() {
  const user = await currentUser();
  const response = await fetch(avatarObjectUrl(user.uid), {
    method: 'DELETE',
    headers: { Authorization: `Firebase ${await user.getIdToken()}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok && response.status !== 404) throw Error(`DELETE avatar: HTTP ${response.status}`);
}
