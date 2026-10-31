import config from './data/firebase.json';
import { applyStreamEvent, coalesce } from './data/stamp-stream.mjs';
import { sameStamp } from './data/stamp-optimistic.mjs';
import { stampEntries } from './data/stamp-record.mjs';
import { deadline, reconnectDelay } from './data/resilience.mjs';
import { recordPath, retryDelay, throttleAt, throttlePath, writeBody } from './data/stamp-write.mjs';
import type { Auth, User } from 'firebase/auth';
export type Stamp = { anchor: string; x: number; y: number; kind: number; angle: number; createdAt: number };
export type PlacedStamp = Stamp & { id: string; owner: string; slot: string; avatar?: string };
// A signed-in visitor: the Firebase UID and the Gravatar hash shown on their stickers.
export type Account = { uid: string; avatar: string };
type RecordData = { updatedAt: number; stamps: Record<string, Stamp>; avatar?: string };
export const pageKey = (path: string) =>
  path === '/' ? 'home' : path.replace(/^\/|\/$/g, '').replaceAll('/', '--');
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
  let stream: EventSource | undefined;
  let records: Record<string, RecordData> = {};
  // Events are applied as they arrive but rendered at most four times a second.
  const render = coalesce(() => {
    try {
      receive(Object.entries(records).flatMap(([owner, record]) => placed(owner, record)));
    } catch {
      fail();
    }
  }, 250);
  const change = (event: MessageEvent, type: string) => {
    try {
      records = applyStreamEvent(records, type, JSON.parse(event.data));
      render.schedule();
    } catch {
      fail();
    }
  };
  // EventSource retries network drops by itself, but closes for good on an HTTP error or a
  // wrong content type (a captive portal's HTML page). Those, and a cancelled listener, are
  // retried here with a backoff, and straight away once the device comes back online.
  let attempts = 0,
    retry: ReturnType<typeof setTimeout> | undefined;
  const lost = (source: EventSource) => {
    fail();
    if (source !== stream || source.readyState !== EventSource.CLOSED) return;
    source.close();
    stream = undefined;
    clearTimeout(retry);
    retry = setTimeout(resume, reconnectDelay(attempts++));
  };
  const resume = () => {
    clearTimeout(retry);
    retry = undefined;
    render.cancel();
    stream?.close();
    stream = undefined;
    if (document.hidden) return;
    const source = new EventSource(url);
    stream = source;
    source.addEventListener('put', (e) => {
      attempts = 0;
      change(e as MessageEvent, 'put');
    });
    source.addEventListener('patch', (e) => change(e as MessageEvent, 'patch'));
    source.addEventListener('cancel', () => {
      source.close();
      lost(source);
    });
    source.onerror = () => lost(source);
  };
  const online = () => {
    attempts = 0;
    resume();
  };
  resume();
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('online', online);
  return () => {
    clearTimeout(retry);
    render.cancel();
    stream?.close();
    document.removeEventListener('visibilitychange', resume);
    window.removeEventListener('online', online);
  };
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
    await instance.authStateReady();
    return { auth: instance, sdk };
  })().catch((error) => {
    auth = undefined;
    throw error;
  }));
}
const isGoogle = (user: User | null): user is User =>
  !!user && !user.isAnonymous && user.providerData.some((p) => p.providerId === 'google.com');
// Gravatar's hash: SHA-256 of the trimmed, lower-cased email address.
export async function gravatarHash(email: string) {
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
// Google's sign-in scripts can hang on a bad network; the button is released after this long.
export const SIGN_IN_TIMEOUT = 20000;
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
  const token = await identity.getIdToken();
  const at = (location: string) => {
    const url = new URL(`${config.databaseURL}/${location}.json`);
    url.searchParams.set('auth', token);
    return url;
  };
  const read = async (location: string) => {
    const response = await fetch(at(location), { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error('Cannot read own stamps');
    return response.json();
  };
  // The throttle entry is read first: if anything is written after that, its compare-and-swap
  // fails, so a second tab cannot overwrite a concurrent change.
  for (let attempt = 0; attempt < 4; attempt++) {
    const throttle = await read(throttlePath(identity.uid));
    const previous = (await read(recordPath(page, identity.uid))) as RecordData | null;
    const data = update(previous);
    if (data === undefined) return previous;
    const saved = await fetch(at(''), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(writeBody(page, identity.uid, data, throttle)),
      signal: AbortSignal.timeout(15000),
    });
    if (saved.status === 401 || saved.status === 403) {
      // Denied: either another tab wrote in between (retry with fresh data) or the last write
      // was under a second ago (wait for the database's interval); invalid data fails again.
      const latest = await read(throttlePath(identity.uid));
      if (throttleAt(latest) === throttleAt(throttle))
        await new Promise((resolve) => setTimeout(resolve, retryDelay(throttleAt(latest))));
      continue;
    }
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
    return settled(written) ? written : ((await read(flat)) as RecordData | null);
  }
  throw Error('Concurrent update; try again');
}
export async function place(path: string, stamp: Omit<Stamp, 'createdAt'>, account: Account) {
  let slot = '0';
  const data = await transaction(path, (data) => {
    const existing = Object.fromEntries(stampEntries(data)) as Record<string, Stamp>;
    const stamps: Record<string, unknown> = { ...existing };
    slot =
      ['0', '1', '2', '3', '4'].find((s) => !stamps[s]) ||
      Object.keys(stamps).sort((a, b) => existing[a].createdAt - existing[b].createdAt)[0];
    stamps[slot] = { ...stamp, createdAt: timestamp() };
    return { stamps, updatedAt: timestamp(), avatar: account.avatar };
  });
  const stamps = placed(account.uid, data);
  return { owner: account.uid, stamps, placed: stamps.find((s) => s.slot === slot)! };
}
export async function remove(path: string, target: PlacedStamp, account: Account) {
  const data = await transaction(path, (data) => {
    const stamps = Object.fromEntries(stampEntries(data)) as Record<string, Stamp>;
    // Do not delete a newer stamp placed in this slot by another tab.
    if (
      !stamps[target.slot] ||
      !sameStamp(stamps[target.slot], target) ||
      stamps[target.slot].createdAt !== target.createdAt
    )
      return undefined;
    delete stamps[target.slot];
    return Object.keys(stamps).length ? { stamps, updatedAt: timestamp(), avatar: account.avatar } : null;
  });
  return { owner: account.uid, stamps: placed(account.uid, data) };
}
