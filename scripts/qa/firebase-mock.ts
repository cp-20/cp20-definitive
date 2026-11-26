// In-memory stand-in for the stickers' Firebase services, for browser checks.
// Stickers need a Google sign-in, which a headless browser cannot do, so a signed-in user is
// seeded into Firebase Auth's storage and the database is served from memory with the same
// ownership and throttle rules (writes need a Google token for the record's own uid).
import { readFile } from 'node:fs/promises';
import type { BrowserContext, Route } from '@playwright/test';
import config from '../../src/data/firebase.json' with { type: 'json' };
// Page keys are checked against database.rules.json itself (the file that gets deployed), so a
// client page key the rules do not allow fails the browser checks too.
const rules = JSON.parse(await readFile(new URL('../../database.rules.json', import.meta.url), 'utf8'));
const pagePattern = rules.rules.pages.$page['.validate'].match(/^\$page\.matches\(\/(.+)\/\)$/)?.[1];
if (!pagePattern) throw Error('database.rules.json has no $page pattern the mock can read');
const allowedPage = (key: string) => new RegExp(pagePattern).test(key);
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
};
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
type Claims = { user_id?: string; email?: string; firebase?: { sign_in_provider?: string } };
const claims = (token: string): Claims => {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  } catch {
    return {};
  }
};
export function googleToken(uid: string, email: string) {
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: 'none' })}.${b64({
    sub: uid,
    user_id: uid,
    email,
    iat: now,
    exp: now + 3600,
    auth_time: now,
    firebase: { sign_in_provider: 'google.com' },
  })}.mock`;
}
type Record_ = { updatedAt?: number; stamps?: Record<string, unknown> };
export type MockDatabase = {
  pages: Map<string, Record<string, Record_>>;
  throttle: Map<string, { at: number; prev: number }>;
  /** Icon pictures in Cloud Storage by uid, as uploaded (checked like storage.rules). */
  avatars: Map<string, { type: string; body: Buffer }>;
  latency: number;
  writes: number;
  // A check's switches for writes, kept here instead of in a page route of its own: removing a
  // route while the streams' polls are in flight lets Playwright hand one request to both routes,
  // and the second answer fails with "Route is already handled".
  /** Writes wait for this before anything else (a save held open). */
  hold?: Promise<void>;
  /** While true, every write fails with HTTP 503 after 800 ms (the database is down). */
  down?: boolean;
};
// Pass the returned db to another context to share the database between visitors.
export async function mockFirebase(
  context: BrowserContext,
  {
    latency = 250,
    db = { pages: new Map(), throttle: new Map(), avatars: new Map(), latency, writes: 0 } as MockDatabase,
  }: { latency?: number; db?: MockDatabase } = {},
) {
  // Streams poll the mocked REST endpoint; a fulfilled route cannot stay open.
  await context.addInitScript(() => {
    // @ts-expect-error: only what the sticker client uses of an EventSource
    window.EventSource = class extends EventTarget {
      url: string;
      closed = false;
      last = '';
      constructor(url: string | URL) {
        super();
        this.url = String(url);
        this.poll();
      }
      async poll() {
        while (!this.closed) {
          try {
            const text = await (await fetch(this.url)).text();
            if (text !== this.last && !this.closed) {
              this.last = text;
              const data = JSON.stringify({ path: '/', data: JSON.parse(text) });
              this.dispatchEvent(new MessageEvent('put', { data }));
            }
          } catch {}
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
      close() {
        this.closed = true;
      }
    };
  });
  // Cloud Storage holds the icon pictures: uploads (multipart, as the site sends them), loads and
  // deletes, allowed like storage.rules (own uid, Google sign-in, WebP or JPEG up to 64KB).
  await context.route(/firebasestorage\.googleapis\.com/, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const url = new URL(request.url());
    const name = decodeURIComponent(url.searchParams.get('name') ?? url.pathname.split('/o/')[1] ?? '');
    const uid = /^avatars\/([^/]+)$/.exec(name)?.[1];
    const token = claims((request.headers().authorization ?? '').replace(/^Firebase /, ''));
    const owner = !!uid && token.user_id === uid && token.firebase?.sign_in_provider === 'google.com';
    const deny = () => route.fulfill({ status: 403, headers: cors, json: { error: { code: 403 } } });
    if (request.method() === 'GET') {
      const picture = uid && db.avatars.get(uid);
      return picture
        ? route.fulfill({
            headers: { ...cors, 'cache-control': 'public, max-age=300' },
            contentType: picture.type,
            body: picture.body,
          })
        : route.fulfill({ status: 404, headers: cors, json: { error: { code: 404 } } });
    }
    if (request.method() === 'DELETE') {
      if (!owner) return deny();
      db.avatars.delete(uid!);
      return route.fulfill({ status: 204, headers: cors });
    }
    // A multipart upload: the JSON metadata part, then the picture.
    const raw = request.postDataBuffer() ?? Buffer.alloc(0);
    const boundary = /boundary=(\S+)/.exec(request.headers()['content-type'] ?? '')?.[1] ?? '';
    const parts = raw.toString('latin1').split(`--${boundary}`).slice(1, -1);
    const meta = JSON.parse(Buffer.from(parts[0]?.split('\r\n\r\n')[1] ?? '{}', 'latin1').toString());
    const body = Buffer.from(
      (parts[1] ?? '').split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, ''),
      'latin1',
    );
    if (!owner || !/^image\/(webp|jpeg)$/.test(meta.contentType) || body.length > 64 * 1024) return deny();
    await new Promise((resolve) => setTimeout(resolve, db.latency));
    db.avatars.set(uid!, { type: meta.contentType, body });
    return route.fulfill({
      headers: cors,
      json: { name, contentType: meta.contentType, size: String(body.length) },
    });
  });
  await context.route(
    /identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com/,
    async (route: Route) => {
      const request = route.request();
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      const body = request.postDataJSON?.() || {};
      if (request.url().includes('accounts:lookup')) {
        const { user_id: uid, email } = claims(body.idToken || '');
        return route.fulfill({
          headers: cors,
          json: {
            users: [
              {
                localId: uid,
                email,
                emailVerified: true,
                providerUserInfo: [{ providerId: 'google.com', rawId: uid, federatedId: uid, email }],
                createdAt: '0',
                lastLoginAt: String(Date.now()),
              },
            ],
          },
        });
      }
      return route.fulfill({ status: 400, headers: cors, json: { error: { message: 'NOT_MOCKED' } } });
    },
  );
  await context.route(/firebasedatabase\.app/, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const url = new URL(request.url());
    const [root, page, uid] = url.pathname
      .replace(/\.json$/, '')
      .split('/')
      .filter(Boolean);
    const token = claims(url.searchParams.get('auth') || '');
    const signedIn = (owner?: string) =>
      token.user_id === owner && token.firebase?.sign_in_provider === 'google.com';
    const deny = () => route.fulfill({ status: 401, headers: cors, json: { error: 'Permission denied' } });
    if (request.method() === 'GET') {
      if (root === 'throttle')
        return signedIn(page)
          ? route.fulfill({ headers: cors, json: db.throttle.get(page) ?? null })
          : deny();
      const records = db.pages.get(page) || {};
      if (!uid) return route.fulfill({ headers: cors, json: Object.keys(records).length ? records : null });
      return route.fulfill({ headers: cors, json: records[uid] ?? null });
    }
    // Writes are multi-path updates of a record and the writer's throttle entry, checked like
    // database.rules.json: own uid only, one write a second, compare-and-swap on `prev`.
    if (request.method() !== 'PATCH' || root) return deny();
    await db.hold;
    if (db.down) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      return route.fulfill({ status: 503, headers: cors, json: { error: 'Test outage' } });
    }
    const body = JSON.parse(request.postData() || '{}');
    const writes = Object.entries(body).map(([path, value]) => [path.split('/'), value] as const);
    const throttle = writes.find(([[kind]]) => kind === 'throttle');
    const owner = throttle?.[0][1] ?? '';
    if (
      !throttle ||
      !signedIn(owner) ||
      writes.some(
        ([[kind, p, u]]) => kind !== 'throttle' && (kind !== 'pages' || !p || !allowedPage(p) || u !== owner),
      ) ||
      writes.some(([keys]) => keys.length !== (keys[0] === 'pages' ? 3 : 2))
    )
      return deny();
    // The latency comes first: the rule check and the write below are one atomic step, like the
    // database's, so two tabs writing at once cannot both pass the compare-and-swap.
    await new Promise((resolve) => setTimeout(resolve, db.latency));
    const now = Date.now();
    const previous = db.throttle.get(owner);
    if (
      (previous?.at ?? 0) !== (throttle[1] as { prev?: number })?.prev ||
      (previous && now < previous.at + 1000)
    )
      return deny();
    const resolve = (value: unknown): any =>
      value && typeof value === 'object'
        ? '.sv' in value
          ? now
          : Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v)]))
        : value;
    // Like the database, the reply holds the written values (server times filled in) as a tree.
    const result: { pages: Record<string, Record<string, unknown>>; throttle: Record<string, unknown> } = {
      pages: {},
      throttle: {},
    };
    for (const [[kind, p], value] of writes) {
      const next = resolve(value);
      if (kind === 'throttle') db.throttle.set(owner, next);
      else {
        const records = db.pages.get(p) || {};
        if (next) records[owner] = next;
        else delete records[owner];
        db.pages.set(p, records);
      }
      if (kind === 'throttle') result.throttle[owner] = next;
      else (result.pages[p] ||= {})[owner] = next ?? null;
    }
    db.writes++;
    return route.fulfill({ headers: cors, json: result });
  });
  return db;
}
// Seeds a Google-signed-in Firebase user for every page of the context.
export async function signInAs(
  context: BrowserContext,
  { uid = 'mock-google-user', email = 'visitor@example.com' } = {},
) {
  const now = Date.now();
  const user = {
    uid,
    email,
    emailVerified: true,
    isAnonymous: false,
    providerData: [
      { providerId: 'google.com', uid, displayName: null, email, phoneNumber: null, photoURL: null },
    ],
    stsTokenManager: {
      refreshToken: 'mock',
      accessToken: googleToken(uid, email),
      expirationTime: now + 3600e3,
    },
    createdAt: String(now),
    lastLoginAt: String(now),
    apiKey: config.apiKey,
    appName: 'cp20-portfolio',
  };
  await context.addInitScript(
    ([key, value]) => {
      localStorage.setItem(key, value);
      localStorage.setItem('cp20-sticker-account', '1');
    },
    [`firebase:authUser:${config.apiKey}:cp20-portfolio`, JSON.stringify(user)],
  );
  return { uid, email };
}
