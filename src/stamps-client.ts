import config from './data/firebase.json';
import { applyStreamEvent, coalesce, keepStream } from './data/stamp-stream.mjs';
import { moveIn, nextRecord, placeIn, recordStamps, removeFrom } from './data/stamp-record.mjs';
import { REQUEST_TIMEOUT_MS, SERVER_TIME, writeRecord } from './data/stamp-write.mjs';
import { pageKey } from './data/site-pages.mjs';
import type { Auth, User } from 'firebase/auth';
import type { Account, Operation, PlacedStamp, SavedRecord, Stamp } from './data/stamp-types';
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
// One read-modify-write of your record on a page (src/data/stamp-write.mjs). Only a sticker's
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
      return nextRecord(result.stamps, account.avatar, SERVER_TIME);
    },
  )) as RecordData | null;
  const stamps = recordStamps(account.uid, record);
  return { owner: account.uid, stamps, placed: stamps.find((s) => s.slot === slot) };
}
