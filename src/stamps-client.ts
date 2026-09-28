import config from './data/firebase.json';
import { applyStreamEvent } from './data/stamp-stream.mjs';
import { sameStamp } from './data/stamp-optimistic.mjs';
import { stampEntries } from './data/stamp-record.mjs';
import type { User } from 'firebase/auth';
export type Stamp = { anchor: string; x: number; y: number; kind: number; angle: number; createdAt: number };
export type PlacedStamp = Stamp & { id: string; owner: string; slot: string };
type RecordData = { updatedAt: number; stamps: Record<string, Stamp> };
export const pageKey = (path: string) =>
  path === '/' ? 'home' : path.replace(/^\/|\/$/g, '').replaceAll('/', '--');
export function subscribe(path: string, receive: (stamps: PlacedStamp[]) => void, fail: () => void) {
  const url = new URL(`${config.databaseURL}/pages/${pageKey(path)}.json`);
  url.searchParams.set('orderBy', '"updatedAt"');
  url.searchParams.set('limitToLast', '100');
  let stream: EventSource | undefined;
  let records: Record<string, RecordData> = {};
  const change = (event: MessageEvent, type: string) => {
    try {
      records = applyStreamEvent(records, type, JSON.parse(event.data));
      receive(
        Object.entries(records).flatMap(([owner, record]) =>
          stampEntries(record).map(([slot, stamp]) => ({
            ...stamp,
            id: `${owner}-${slot}`,
            owner,
            slot,
          })),
        ),
      );
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
let identityPromise: Promise<User> | undefined;
async function loadUser() {
  const [{ initializeApp, getApps }, { getAuth, signInAnonymously }] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
  ]);
  const app = getApps().find((a) => a.name === 'cp20-portfolio') || initializeApp(config, 'cp20-portfolio');
  const auth = getAuth(app);
  await auth.authStateReady();
  return auth.currentUser || (await signInAnonymously(auth)).user;
}
function user() {
  return (identityPromise ||= loadUser().catch((error) => {
    identityPromise = undefined;
    throw error;
  }));
}
export async function identify() {
  const identity = await user();
  try {
    localStorage.setItem('cp20-stamp-owner', identity.uid);
  } catch {}
  return identity.uid;
}
const timestamp = () => ({ '.sv': 'timestamp' });
async function transaction(path: string, update: (data: RecordData | null) => unknown) {
  const identity = await user();
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
function ownStamps(data: RecordData | null, owner: string): PlacedStamp[] {
  return stampEntries(data).map(([slot, stamp]) => ({
    ...stamp,
    id: `${owner}-${slot}`,
    owner,
    slot,
  }));
}
export async function place(path: string, stamp: Omit<Stamp, 'createdAt'>) {
  const owner = (await user()).uid;
  let slot = '0';
  const data = await transaction(path, (data) => {
    const existing = Object.fromEntries(stampEntries(data)) as Record<string, Stamp>;
    const stamps: Record<string, unknown> = { ...existing };
    slot =
      ['0', '1', '2', '3', '4'].find((s) => !stamps[s]) ||
      Object.keys(stamps).sort((a, b) => existing[a].createdAt - existing[b].createdAt)[0];
    stamps[slot] = { ...stamp, createdAt: timestamp() };
    return { stamps, updatedAt: timestamp() };
  });
  const stamps = ownStamps(data, owner);
  return { owner, stamps, placed: stamps.find((s) => s.slot === slot)! };
}
export async function remove(path: string, target: PlacedStamp) {
  const owner = (await user()).uid;
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
    return Object.keys(stamps).length ? { stamps, updatedAt: timestamp() } : null;
  });
  return { owner, stamps: ownStamps(data, owner) };
}
