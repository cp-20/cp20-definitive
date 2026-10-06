// In-memory stand-in for the stickers' Firebase services, for browser checks.
// Stickers need a Google sign-in, which a headless browser cannot do, so a signed-in user is
// seeded into Firebase Auth's storage and the database is served from memory with the same
// ownership rules (writes need a Google token for the record's own uid).
import { readFile } from 'node:fs/promises';
const config = JSON.parse(await readFile(new URL('../src/data/firebase.json', import.meta.url)));
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
  'access-control-expose-headers': 'ETag',
};
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const claims = (token) => {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  } catch {
    return {};
  }
};
export function googleToken(uid, email) {
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
// Pass the returned db to another context to share the database between visitors.
export async function mockFirebase(
  context,
  { latency = 250, db = { pages: new Map(), latency, writes: 0 } } = {},
) {
  // Streams poll the mocked REST endpoint; a fulfilled route cannot stay open.
  await context.addInitScript(() => {
    window.EventSource = class extends EventTarget {
      constructor(url) {
        super();
        this.url = String(url);
        this.closed = false;
        this.last = '';
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
  // Gravatar is the only remote image; serve a local placeholder.
  await context.route(/gravatar\.com\/avatar/, (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#f0a6c2"/><circle cx="32" cy="26" r="12" fill="#fff"/><rect x="14" y="42" width="36" height="22" rx="11" fill="#fff"/></svg>',
    }),
  );
  await context.route(/identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com/, async (route) => {
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
  });
  await context.route(/firebasedatabase\.app/, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const url = new URL(request.url());
    const [, page, uid] = url.pathname
      .replace(/\.json$/, '')
      .split('/')
      .filter(Boolean);
    const records = db.pages.get(page) || {};
    if (!uid) return route.fulfill({ headers: cors, json: Object.keys(records).length ? records : null });
    const record = records[uid] ?? null;
    const tag = `"${b64(record).slice(-24)}"`;
    if (request.method() === 'GET') return route.fulfill({ headers: { ...cors, ETag: tag }, json: record });
    const token = claims(url.searchParams.get('auth') || '');
    if (token.user_id !== uid || token.firebase?.sign_in_provider !== 'google.com')
      return route.fulfill({ status: 401, headers: cors, json: { error: 'Permission denied' } });
    const match = request.headers()['if-match'];
    if (match && match !== tag)
      return route.fulfill({ status: 412, headers: { ...cors, ETag: tag }, json: record });
    await new Promise((resolve) => setTimeout(resolve, db.latency));
    const resolve = (value) =>
      value && typeof value === 'object'
        ? '.sv' in value
          ? Date.now()
          : Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v)]))
        : value;
    const next = request.method() === 'DELETE' ? null : resolve(JSON.parse(request.postData() || 'null'));
    if (next) records[uid] = next;
    else delete records[uid];
    db.pages.set(page, records);
    db.writes++;
    return route.fulfill({ headers: cors, json: next });
  });
  return db;
}
// Seeds a Google-signed-in Firebase user for every page of the context.
export async function signInAs(context, { uid = 'mock-google-user', email = 'visitor@example.com' } = {}) {
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
