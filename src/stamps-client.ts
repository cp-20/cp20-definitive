import config from './data/firebase.json';
import { applyStreamEvent } from './data/stamp-stream.mjs';
import { sameStamp } from './data/stamp-optimistic.mjs';
import { stampEntries } from './data/stamp-record.mjs';
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
  const change = (event: MessageEvent, type: string) => {
    try {
      records = applyStreamEvent(records, type, JSON.parse(event.data));
      receive(Object.entries(records).flatMap(([owner, record]) => placed(owner, record)));
    } catch {
      fail();
    }
  };
  const resume = () => {
    stream?.close();
    stream = undefined;
    if (document.hidden) return;
    stream = new EventSource(url);
    stream.addEventListener('put', (e) => change(e as MessageEvent, 'put'));
    stream.addEventListener('patch', (e) => change(e as MessageEvent, 'patch'));
    stream.addEventListener('cancel', () => {
      stream?.close();
      fail();
    });
    stream.onerror = fail; // EventSource reconnects after transient network failures.
  };
  resume();
  document.addEventListener('visibilitychange', resume);
  return () => {
    stream?.close();
    document.removeEventListener('visibilitychange', resume);
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

const timestamp = () => ({ '.sv': 'timestamp' });
async function transaction(path: string, update: (data: RecordData | null) => unknown) {
  const identity = await currentUser();
  const url = new URL(`${config.databaseURL}/pages/${pageKey(path)}/${identity.uid}.json`);
  url.searchParams.set('auth', await identity.getIdToken());
  // ETags prevent a second tab from overwriting a concurrent change.
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await fetch(url, {
      headers: { 'X-Firebase-ETag': 'true' },
      signal: AbortSignal.timeout(15000),
    });
    if (!current.ok) throw Error('Cannot read own stamps');
    const tag = current.headers.get('ETag');
    if (!tag) throw Error('Missing concurrency token');
    const previous = await current.json();
    const data = update(previous);
    if (data === undefined) return previous as RecordData | null;
    const saved = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': tag },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(15000),
    });
    if (saved.status === 412) continue;
    if (!saved.ok) throw Error('Cannot save stamp');
    return (await saved.json()) as RecordData | null;
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
