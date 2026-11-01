import config from './data/firebase.json';
import { applyStreamEvent, coalesce, keepStream } from './data/stamp-stream.mjs';
import { moveIn, placeIn, removeFrom, stampEntries } from './data/stamp-record.mjs';
import { deadline } from './data/resilience.mjs';
import { recordPath, throttlePath, writeBody, writeWithRetry } from './data/stamp-write.mjs';
import { pageKey } from './data/site-pages.mjs';
import {
  AUTH_TIMEOUT_MS as AUTH_TIMEOUT,
  REQUEST_TIMEOUT_MS as REQUEST_TIMEOUT,
  SIGN_IN_TIMEOUT_MS as SIGN_IN_TIMEOUT,
} from './data/stamp-limits.mjs';
import type { Auth, User } from 'firebase/auth';
import type { Account, PlacedStamp, Stamp } from './data/stamp-types';
type RecordData = { updatedAt: number; stamps: Record<string, Stamp>; avatar?: string };
const gravatarPattern = /^[0-9a-f]{64}$/;
const placed = (owner: string, record: RecordData | null): PlacedStamp[] =>
  stampEntries(record).map(([slot, stamp]) => ({
    ...stamp,
    id: `${owner}-${slot}`,
    owner,
    slot,
    avatar:
      typeof record?.avatar === 'string' && gravatarPattern.test(record.avatar) ? record.avatar : undefined,
  }));
export function subscribe(path: string, receive: (stamps: PlacedStamp[]) => void, fail: () => void) {
  const url = new URL(`${config.databaseURL}/pages/${pageKey(path)}.json`);
  url.searchParams.set('orderBy', '"updatedAt"');
  url.searchParams.set('limitToLast', '100');
  let records: Record<string, RecordData> = {};
  // Events are applied as they arrive but rendered at most four times a second.
  const render = coalesce(() => {
    try {
      receive(Object.entries(records).flatMap(([owner, record]) => placed(owner, record)));
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

const timestamp = () => ({ '.sv': 'timestamp' });
const settled = (value: unknown): value is RecordData | null =>
  value === null || (typeof value === 'object' && typeof (value as RecordData).updatedAt === 'number');
async function transaction(path: string, update: (data: RecordData | null) => unknown) {
  const identity = await currentUser();
  const page = pageKey(path);
  const token = await deadline(identity.getIdToken(), REQUEST_TIMEOUT);
  const at = (location: string) => {
    const url = new URL(`${config.databaseURL}/${location}.json`);
    url.searchParams.set('auth', token);
    return url;
  };
  const read = async (location: string) => {
    const response = await fetch(at(location), { signal: AbortSignal.timeout(REQUEST_TIMEOUT) });
    if (!response.ok) throw Error('Cannot read own stamps');
    return response.json();
  };
  return (await writeWithRetry(
    {
      readThrottle: () => read(throttlePath(identity.uid)),
      readRecord: async () => (await read(recordPath(page, identity.uid))) as RecordData | null,
      save: async (data: unknown, throttle: unknown) => {
        const saved = await fetch(at(''), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(writeBody(page, identity.uid, data, throttle)),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT),
        });
        // Denied: another tab wrote in between, or the last write was under a second ago.
        if (saved.status === 401 || saved.status === 403) return { denied: true };
        if (!saved.ok) throw Error('Cannot save stamp');
        // The response echoes the written data (flat or nested); read it back if it is not there.
        const body = (await saved.json()) as Record<string, any> | null;
        const flat = recordPath(page, identity.uid),
          nested = body?.pages?.[page];
        const written =
          body && flat in body
            ? body[flat]
            : nested && typeof nested === 'object' && identity.uid in nested
              ? nested[identity.uid]
              : undefined;
        return { record: settled(written) ? written : ((await read(flat)) as RecordData | null) };
      },
      wait: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
    },
    update,
  )) as RecordData | null;
}
const recordOf = (account: Account, stamps: Record<string, unknown> | undefined) =>
  stamps === undefined
    ? undefined
    : Object.keys(stamps).length
      ? { stamps, updatedAt: timestamp(), avatar: account.avatar }
      : null;
export async function place(path: string, stamp: Omit<Stamp, 'createdAt'>, account: Account, reuse = false) {
  let slot = '0';
  const data = await transaction(path, (data) => {
    const edit = placeIn(data, stamp, timestamp(), reuse);
    slot = edit.slot;
    return recordOf(account, edit.stamps);
  });
  const stamps = placed(account.uid, data);
  return { owner: account.uid, stamps, placed: stamps.find((s) => s.slot === slot) };
}
export async function remove(path: string, target: PlacedStamp, account: Account) {
  // Does nothing if the slot now holds a newer stamp placed by another tab.
  const data = await transaction(path, (data) => recordOf(account, removeFrom(data, target).stamps));
  return { owner: account.uid, stamps: placed(account.uid, data) };
}
// Moving a sticker is one write of its own slot, so it never pushes out another sticker.
export async function move(
  path: string,
  target: PlacedStamp,
  stamp: Omit<Stamp, 'createdAt'>,
  account: Account,
  reuse = false,
) {
  let slot = target.slot;
  const data = await transaction(path, (data) => {
    const edit = moveIn(data, target, stamp, timestamp(), reuse);
    slot = edit.slot;
    return recordOf(account, edit.stamps);
  });
  const stamps = placed(account.uid, data);
  return { owner: account.uid, stamps, placed: stamps.find((s) => s.slot === slot) };
}
