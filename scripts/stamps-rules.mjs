// Integration test of database.rules.json.
// STAMPS_LIVE_TEST=1: against the dedicated live stamps database. Always: public reads are
// bounded, and visitors without a Google account cannot write (a temporary anonymous account
// is created and deleted, if anonymous sign-in is enabled). With STAMPS_GOOGLE_ID_TOKEN (an ID
// token of a Google sign-in, e.g. copied from a browser session), also checks validation with
// a real writer and removes the test stamp.
// STAMPS_RULES_EMULATOR=127.0.0.1:9000: against a local Realtime Database emulator instead
// (e.g. `java -jar firebase-database-emulator-*.jar --port 9000`); the repository's rules are
// loaded into a throwaway namespace and unsigned Google tokens stand in for real sign-ins.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { throttlePath, writeBody } from '../src/data/stamp-write.mjs';
import { mergeWorks, stampPageKeys } from '../src/data/site-pages.mjs';
const emulator = process.env.STAMPS_RULES_EMULATOR;
if (process.env.STAMPS_LIVE_TEST !== '1' && !emulator)
  throw Error(
    'Set STAMPS_LIVE_TEST=1 to test the dedicated live stamps database, or STAMPS_RULES_EMULATOR=host:port',
  );
const config = JSON.parse(await fs.readFile(new URL('../src/data/firebase.json', import.meta.url), 'utf8'));
assert.equal(
  config.databaseURL,
  'https://cp20-platform-portfolio-stamps.asia-southeast1.firebasedatabase.app',
);
const loadData = async (name) =>
  JSON.parse(await fs.readFile(new URL(`../src/data/${name}.json`, import.meta.url), 'utf8'));
// The last page in the generated pattern: a work page key that really is accepted.
const lastPage = stampPageKeys(mergeWorks(await loadData('works'), await loadData('manual'))).at(-1);
const base = emulator ? `http://${emulator}` : config.databaseURL;
const namespace = `stamps-rules-${Date.now()}`;
async function request(path, method = 'GET', body, token, params = {}) {
  const url = new URL(`${base}/${path}.json`);
  if (emulator) url.searchParams.set('ns', namespace);
  if (token) url.searchParams.set('auth', token);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const unsignedToken = (uid, provider = 'google.com') => {
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
    sub: uid,
    user_id: uid,
    iat: now,
    exp: now + 3600,
    firebase: { sign_in_provider: provider },
  })}.`;
};
if (emulator) {
  const rules = await fs.readFile(new URL('../database.rules.json', import.meta.url), 'utf8');
  const loaded = await fetch(`${base}/.settings/rules.json?ns=${namespace}`, {
    method: 'PUT',
    headers: { Authorization: 'Bearer owner' },
    body: rules,
  });
  assert.equal(loaded.status, 200, `rules load: ${await loaded.text()}`);
}
const uidOf = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).user_id;
const avatar = 'a'.repeat(64);
const stamp = { anchor: 'intro', x: 0.3, y: 0.7, kind: 0, angle: -4, createdAt: { '.sv': 'timestamp' } };
const record = (s, extra = {}) => ({ updatedAt: { '.sv': 'timestamp' }, stamps: { 0: s }, avatar, ...extra });
let checks = 0;
const expect = async (response, status, label) => {
  assert.equal((await response).status, status, label);
  checks++;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Writes the way the site does: the record and the throttle entry in one multi-path update.
async function write(page, uid, body, token, { throttle } = {}) {
  if (throttle === undefined) {
    const current = await request(`throttle/${uid}`, 'GET', undefined, token);
    throttle = current.ok ? await current.json() : null;
  }
  return request('', 'PATCH', writeBody(page, uid, body, throttle), token);
}

await expect(request('pages/home'), 401, 'unbounded public read denied');
await expect(
  request('pages/home', 'GET', undefined, null, { orderBy: '"updatedAt"', limitToLast: '100' }),
  200,
  'bounded public read allowed',
);
await expect(request('pages/home/someone', 'PUT', record(stamp)), 401, 'unauthenticated write denied');

if (emulator) {
  await expect(
    write('home', 'anon', record(stamp), unsignedToken('anon', 'anonymous')),
    401,
    'anonymous account write denied',
  );
} else {
  const signUp = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${config.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnSecureToken: true }),
    },
  );
  if (signUp.ok) {
    const { idToken, localId } = await signUp.json();
    try {
      await expect(
        request(`pages/home/${localId}`, 'PUT', record(stamp), idToken),
        401,
        'anonymous account write denied',
      );
    } finally {
      await request(`pages/home/${localId}`, 'DELETE', undefined, idToken);
      await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${config.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
    }
  } else console.log('Anonymous sign-in is disabled; skipped the anonymous write check');
}

const google = emulator ? unsignedToken('rules-test-writer') : process.env.STAMPS_GOOGLE_ID_TOKEN;
if (google) {
  const uid = uidOf(google);
  const put = (body) => write('home', uid, body, google);
  try {
    await expect(write('home', 'someone-else', record(stamp), google), 401, 'other owner write denied');
    await expect(put(record({ ...stamp, x: 2 })), 401, 'out-of-range position denied');
    await expect(put(record({ ...stamp, kind: 99 })), 401, 'unknown stamp denied');
    await expect(put(record({ ...stamp, html: '<script>' })), 401, 'extra stamp data denied');
    await expect(put(record(stamp, { avatar: 'https://example.com/a.png' })), 401, 'non-hash avatar denied');
    await expect(put(record(stamp, { email: 'a@example.com' })), 401, 'extra record data denied');
    await expect(
      put({ updatedAt: { '.sv': 'timestamp' }, stamps: { 5: stamp }, avatar }),
      401,
      'sixth slot denied',
    );
    await expect(write('fake-route', uid, record(stamp), google), 401, 'unknown page denied');
    await expect(write('works--not-a-page', uid, record(stamp), google), 401, 'unknown work page denied');
    await expect(
      request(`pages/home/${uid}`, 'PUT', record(stamp), google),
      401,
      'record write without the throttle entry denied',
    );
    await expect(put(record(stamp)), 200, 'valid own stamp accepted');
    await expect(put(record(stamp)), 401, 'rapid repeat denied');
    await sleep(1100);
    await expect(
      write('home', uid, record(stamp), google, { throttle: null }),
      401,
      'stale throttle entry (concurrent change) denied',
    );
    await expect(
      request(`pages/home/${uid}/stamps/0/x`, 'PUT', 0.5, google),
      401,
      'child write without updatedAt denied',
    );
    await expect(
      request(`pages/home/${uid}/stamps/0`, 'PATCH', { x: 0.5, y: 0.5 }, google),
      401,
      'partial stamp update denied',
    );
    // Only the child path is wrong here: the throttle entry carries the prev just read.
    const current = await (await request(`throttle/${uid}`, 'GET', undefined, google)).json();
    await expect(
      request(
        '',
        'PATCH',
        {
          [`pages/home/${uid}/stamps/0/x`]: 0.5,
          [throttlePath(uid)]: writeBody('home', uid, null, current)[throttlePath(uid)],
        },
        google,
      ),
      401,
      'child write with a valid throttle entry denied',
    );
    await expect(put(record({ ...stamp, x: 0.4 })), 200, 'update after the interval accepted');
    await expect(request(`pages/home/${uid}`, 'DELETE', undefined, google), 200, 'own stamp removable');
    await expect(put(record(stamp)), 401, 'delete then immediate re-create denied');
    await expect(
      request(`throttle/${uid}`, 'DELETE', undefined, google),
      401,
      'throttle entry cannot be deleted',
    );
    await sleep(1100);
    await expect(put(record(stamp)), 200, 're-create after the interval accepted');
    await sleep(1100);
    await expect(write(lastPage, uid, record(stamp), google), 200, `${lastPage} (last listed page) accepted`);
    await sleep(1100);
    await expect(write(lastPage, uid, null, google), 200, `${lastPage} record removable`);
    await sleep(1100);
    await expect(put(null), 200, 'own stamps removable with the throttle entry');
  } finally {
    await sleep(1100);
    await request(`pages/home/${uid}`, 'DELETE', undefined, google);
    await request(`pages/${lastPage}/${uid}`, 'DELETE', undefined, google);
  }
} else console.log('Set STAMPS_GOOGLE_ID_TOKEN to also check validation with a Google account');
console.log(`Firebase rules: ${checks} checks passed`);
